import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes:ModuleRoute[]=[
{path:'products',element:<IndexPage/>,roles:['ADMIN','STAFF']},{path:'products/new',element:<IndexPage/>,roles:['ADMIN']},{path:'products/:id',element:<IndexPage/>,roles:['ADMIN','STAFF']}];
