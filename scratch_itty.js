import { Router } from 'itty-router';
const router = Router();
router.put('/test/:id', (req, env, ctx) => {
  console.log('req.params:', req.params);
  console.log('ctx?.params:', ctx?.params);
  return new Response('ok');
});

const req = new Request('http://localhost/test/123', { method: 'PUT' });
router.handle(req, {}, {}).then(console.log);
