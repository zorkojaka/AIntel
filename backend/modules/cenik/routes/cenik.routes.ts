import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  precheckCreateProduct,
  updateProduct
} from '../controllers/cenik.controller';
import {
  createProductServiceLink,
  deleteProductServiceLink,
  getProductServiceLinks,
  updateProductServiceLink,
} from '../controllers/product-service-link.controller';

const router = Router();

router.get('/products', getAllProducts);
router.get('/products/:id', getProductById);
router.post('/products/precheck', precheckCreateProduct);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.get('/product-service-links', getProductServiceLinks);
router.post('/product-service-links', createProductServiceLink);
router.put('/product-service-links/:id', updateProductServiceLink);
router.delete('/product-service-links/:id', deleteProductServiceLink);

export default router;
