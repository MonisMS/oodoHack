import { PageHeader } from '../ui/PageHeader';
import { EmptyState } from '../ui/EmptyState';
export function ModulePage({ title, owner }: { title: string; owner: string }) {
  return <><PageHeader title={title} description="Shared foundation · feature workstream pending"/><EmptyState title={`Ready for Person ${owner}`}>The route and API contract are registered. This page is a scaffold; connect the assigned module to the API as its workstream is implemented.</EmptyState></>;
}
