import { ProjectView } from "@/components/project-view";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  return <ProjectView id={Number(id)} />;
}
