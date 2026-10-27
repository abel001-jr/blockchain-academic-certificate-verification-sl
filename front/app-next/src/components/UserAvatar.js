"use client";
import { useState } from "react";

export default function UserAvatar({ user }) {
  const [failedPhoto, setFailedPhoto] = useState("");
  const photo = user.profile_photo;
  const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (photo && failedPhoto !== photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={`${name || "User"} profile photo`} onError={() => setFailedPhoto(photo)} className="h-10 w-10 shrink-0 rounded-full border border-[var(--cd-line)] object-cover" />;
  }
  return <div aria-label={name || "User"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#08283F] text-xs font-bold text-white">{((user.first_name?.[0] || "") + (user.last_name?.[0] || "")).toUpperCase() || "?"}</div>;
}
