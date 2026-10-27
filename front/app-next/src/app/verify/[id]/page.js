import { redirect } from "next/navigation";

export default async function VerifyCredentialLink({params, searchParams}) {
  const {id} = await params;
  const search = await searchParams;
  const query = new URLSearchParams({id});
  for (const key of ["code", "consent"]) {
    const value = search?.[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  redirect(`/employer-verification?${query}`);
}
