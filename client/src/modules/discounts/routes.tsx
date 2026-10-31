import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes:ModuleRoute[]=[
{path:'discounts',element:<IndexPage/>,roles:['ADMIN','STAFF']},{path:'discounts/new',element:<IndexPage/>,roles:['ADMIN']},{path:'discounts/:id',element:<IndexPage/>,roles:['ADMIN','STAFF']}];
