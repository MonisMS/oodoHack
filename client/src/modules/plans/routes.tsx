import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes:ModuleRoute[]=[
{path:'plans',element:<IndexPage/>,roles:['ADMIN','STAFF']},{path:'plans/new',element:<IndexPage/>,roles:['ADMIN']},{path:'plans/:id',element:<IndexPage/>,roles:['ADMIN','STAFF']}];
