import { Router } from 'express';
import { requireRoles } from '../../middlewares/auth';
import { ROLE_ADMIN, ROLE_FINANCE, ROLE_SALES } from '../../utils/roles';
import {
  createZahteva,
  deleteZahteva,
  getPredlogDisk,
  getPredlogNosilci,
  getPredlogSnemalnik,
  getPredlogSwitch,
  getZahteva,
  nadaljujZahtevaNaPonudbo,
  updateZahteva,
} from './zahteva.controller';

const router = Router();
const requireRequestWrite = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE]);

router.get('/predlogi/snemalnik', getPredlogSnemalnik);
router.get('/predlogi/switch', getPredlogSwitch);
router.get('/predlogi/disk', getPredlogDisk);
router.get('/predlogi/nosilci', getPredlogNosilci);

router.post('/', requireRequestWrite, createZahteva);
router.get('/:id', getZahteva);
router.put('/:id', requireRequestWrite, updateZahteva);
router.post('/:id/nadaljuj-na-ponudbo', requireRequestWrite, nadaljujZahtevaNaPonudbo);
router.delete('/:id', requireRequestWrite, deleteZahteva);

export default router;
