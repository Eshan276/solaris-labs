import { ProofView } from "@/components/proof-view";

export default async function PayoutProofPage(props: PageProps<"/projects/[id]/payouts/[index]">) {
  const { id, index } = await props.params;
  return <ProofView projectId={Number(id)} index={Number(index)} />;
}
