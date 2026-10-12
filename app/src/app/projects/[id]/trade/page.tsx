import { TradeView } from "@/components/trade-view";

export const metadata = { title: "Trade · Solaris" };

export default async function TradePage(props: PageProps<"/projects/[id]/trade">) {
  const { id } = await props.params;
  return <TradeView id={Number(id)} />;
}
