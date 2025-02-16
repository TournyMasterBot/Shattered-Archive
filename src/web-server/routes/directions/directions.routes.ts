import asyncHandler from '@shared/express-server/async-handler';
import { Router } from 'express';
import { getRooms } from 'handlers/directions-handlers/room-handlers';

const router = Router();

router.get('/', (req, res) => {
  res.send('Hello from Directions Home!');
});

router.get("/get-rooms", asyncHandler(getRooms));

export default router;
