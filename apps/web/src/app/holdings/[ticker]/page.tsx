import { redirect } from "next/navigation";

interface PageProps {
  readonly params: Promise<{ readonly ticker: string }>;
}

export default async function ConstituentPage({ params }: PageProps) {
  await params;
  redirect("/markets");
}
