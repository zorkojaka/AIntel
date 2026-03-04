import { Router } from 'express';
import { searchPriceListItems } from '../controllers/cenik.controller';

const router = Router();

router.get('/items/search', searchPriceListItems);

export default router;
