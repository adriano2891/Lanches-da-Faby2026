import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { dbInstance } from './src/server/db.ts';
import { computeStoreStatus } from './src/server/statusHelper.ts';
import type { CartItem, Product, Additional } from './src/types.ts';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Auth middleware for admin endpoints
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado. Faça login como administrador.' });
  }

  const token = authHeader.substring(7);
  const admin = dbInstance.validateSession(token);
  if (!admin) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
  }

  (req as any).admin = admin;
  next();
}

// PUBLIC API ROUTES

// 1. Get full menu and store status
app.get('/api/menu', (req: Request, res: Response) => {
  const config = dbInstance.getConfig();
  const products = dbInstance.getProducts();
  const additionals = dbInstance.getAdditionals();
  const storeStatus = computeStoreStatus(config);

  res.json({
    config,
    products,
    additionals,
    storeStatus
  });
});

// 2. Validate cart items before checkout
app.post('/api/validate-cart', (req: Request, res: Response) => {
  const { items } = req.body as { items: CartItem[] };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Formato de carrinho inválido' });
  }

  const currentProducts = dbInstance.getProducts();
  const currentAdditionals = dbInstance.getAdditionals();
  const config = dbInstance.getConfig();
  const storeStatus = computeStoreStatus(config);

  const changes: string[] = [];
  const updatedItems: CartItem[] = [];

  for (const item of items) {
    const product = currentProducts.find(p => p.id === item.productId);
    if (!product) {
      changes.push(`O item "${item.productName}" foi removido do cardápio.`);
      continue;
    }

    if (!product.available) {
      changes.push(`O item "${product.name}" está temporariamente esgotado.`);
      continue;
    }

    // Determine current base price
    let currentBasePrice = product.price;
    if (product.isDrink && item.drinkOption?.sizeId) {
      const size = product.drinkDetails?.sizes?.find(s => s.id === item.drinkOption?.sizeId);
      if (size) {
        if (!size.available) {
          changes.push(`O tamanho selecionado de "${product.name}" está esgotado.`);
          continue;
        }
        currentBasePrice = size.price;
      }
    }

    // Calculate additionals
    let additionalsTotal = 0;
    const validatedAdditionals = [];

    for (const add of item.additionals || []) {
      const dbAdd = currentAdditionals.find(a => a.id === add.id);
      if (dbAdd && dbAdd.active) {
        if (dbAdd.price !== add.price) {
          changes.push(`O adicional "${dbAdd.name}" teve o preço atualizado de R$ ${(add.price / 100).toFixed(2)} para R$ ${(dbAdd.price / 100).toFixed(2)}.`);
        }
        validatedAdditionals.push({
          id: dbAdd.id,
          name: dbAdd.name,
          price: dbAdd.price,
          quantity: Math.min(add.quantity, dbAdd.maxQuantity)
        });
        additionalsTotal += dbAdd.price * Math.min(add.quantity, dbAdd.maxQuantity);
      } else if (dbAdd && !dbAdd.active) {
        changes.push(`O adicional "${add.name}" não está mais disponível.`);
      }
    }

    if (currentBasePrice !== item.basePrice) {
      changes.push(`O preço de "${product.name}" foi atualizado de R$ ${(item.basePrice / 100).toFixed(2)} para R$ ${(currentBasePrice / 100).toFixed(2)}.`);
    }

    const unitPriceWithAdditionals = currentBasePrice + additionalsTotal;
    const totalPrice = unitPriceWithAdditionals * item.quantity;

    updatedItems.push({
      ...item,
      basePrice: currentBasePrice,
      additionals: validatedAdditionals,
      unitPriceWithAdditionals,
      totalPrice
    });
  }

  res.json({
    valid: changes.length === 0,
    changes,
    items: updatedItems,
    storeStatus
  });
});

// ADMIN AUTH ROUTES

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const result = dbInstance.authenticateAdmin(email, password);
  if (!result) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  res.json(result);
});

app.post('/api/admin/logout', (req: Request, res: Response) => {
  const token = req.headers.authorization?.substring(7);
  if (token) {
    dbInstance.logoutSession(token);
  }
  res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const info = dbInstance.getAdminInfo(admin.id);
  res.json({ user: info });
});

app.post('/api/admin/reset-password', (req: Request, res: Response) => {
  const { recoveryKey, newPassword } = req.body;
  if (!recoveryKey || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Chave de recuperação e nova senha com no mínimo 6 caracteres são obrigatórios.' });
  }

  const success = dbInstance.resetPasswordWithRecovery(recoveryKey, newPassword);
  if (!success) {
    return res.status(400).json({ error: 'Chave de recuperação inválida.' });
  }

  res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com sua nova senha.' });
});

app.post('/api/admin/change-password', requireAdmin, (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Senha atual e nova senha de no mínimo 6 dígitos são obrigatórias.' });
  }

  const success = dbInstance.changePassword(admin.id, oldPassword, newPassword);
  if (!success) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }

  res.json({ success: true, message: 'Senha alterada com sucesso.' });
});

// PROTECTED ADMIN DATA MANAGEMENT ROUTES

app.put('/api/admin/config', requireAdmin, (req: Request, res: Response) => {
  const updates = req.body;
  const updatedConfig = dbInstance.updateConfig(updates);
  res.json(updatedConfig);
});

app.post('/api/admin/products', requireAdmin, (req: Request, res: Response) => {
  const productData = req.body;
  if (!productData.name || !productData.categoryId) {
    return res.status(400).json({ error: 'Nome e categoria são obrigatórios.' });
  }
  const created = dbInstance.addProduct(productData);
  res.status(201).json(created);
});

app.put('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id;
  const updates = req.body;
  const updated = dbInstance.updateProduct(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json(updated);
});

app.delete('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id;
  const success = dbInstance.deleteProduct(id);
  if (!success) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  res.json({ success: true });
});

app.post('/api/admin/products/reorder', requireAdmin, (req: Request, res: Response) => {
  const { orderMap } = req.body as { orderMap: { [id: string]: number } };
  if (!orderMap) {
    return res.status(400).json({ error: 'Mapa de ordem ausente.' });
  }
  for (const [id, order] of Object.entries(orderMap)) {
    dbInstance.updateProduct(id, { order });
  }
  res.json({ success: true, products: dbInstance.getProducts() });
});

app.post('/api/admin/additionals', requireAdmin, (req: Request, res: Response) => {
  const addData = req.body;
  if (!addData.name || addData.price === undefined) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }
  const created = dbInstance.addAdditional(addData);
  res.status(201).json(created);
});

app.put('/api/admin/additionals/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id;
  const updates = req.body;
  const updated = dbInstance.updateAdditional(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Adicional não encontrado.' });
  }
  res.json(updated);
});

app.delete('/api/admin/additionals/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id;
  const success = dbInstance.deleteAdditional(id);
  if (!success) {
    return res.status(404).json({ error: 'Adicional não encontrado.' });
  }
  res.json({ success: true });
});

// Photo upload (stores image into public/uploads or as data URL)
app.post('/api/admin/upload-photo', requireAdmin, (req: Request, res: Response) => {
  try {
    const { imageData, filename } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'Dados da imagem ausentes.' });
    }

    // If already an absolute URL or external link
    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:image')) {
        const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Determine extension reliably from MIME
        const mimeMatch = imageData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
        let ext = 'jpg';
        if (mimeMatch && mimeMatch[1]) {
          const sub = mimeMatch[1].toLowerCase();
          if (sub.includes('png')) ext = 'png';
          else if (sub.includes('webp')) ext = 'webp';
          else if (sub.includes('svg')) ext = 'svg';
          else if (sub.includes('gif')) ext = 'gif';
          else ext = 'jpg';
        } else if (filename && typeof filename === 'string' && filename.includes('.')) {
          const fileExt = filename.split('.').pop()?.toLowerCase();
          if (fileExt && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(fileExt)) {
            ext = fileExt === 'jpeg' ? 'jpg' : fileExt;
          }
        }

        const cleanFilename = `faby_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const base64Data = imageData.includes(';base64,')
          ? imageData.split(';base64,')[1]
          : imageData.replace(/^data:image\/[^;]+;base64,/, '');

        const filePath = path.join(uploadsDir, cleanFilename);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        // If dist directory exists (production), write there too
        const distUploadsDir = path.resolve(process.cwd(), 'dist', 'uploads');
        if (fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
          if (!fs.existsSync(distUploadsDir)) {
            fs.mkdirSync(distUploadsDir, { recursive: true });
          }
          try {
            fs.writeFileSync(path.join(distUploadsDir, cleanFilename), Buffer.from(base64Data, 'base64'));
          } catch {}
        }

        return res.json({ url: `/uploads/${cleanFilename}` });
      }
      return res.json({ url: imageData });
    }

    return res.status(400).json({ error: 'Formato não suportado' });
  } catch (err: any) {
    console.error('Error saving uploaded photo:', err);
    return res.status(500).json({ error: 'Erro ao salvar foto no servidor: ' + err.message });
  }
});

// SERVE VITE IN DEV OR STATIC BUILD IN PRODUCTION
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // Ensure public uploads directory exists and is explicitly served
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    immutable: true,
  }));

  // Ensure public directory is served statically for other assets
  app.use(express.static('public'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Faby Lanches server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
