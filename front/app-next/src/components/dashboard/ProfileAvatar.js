"use client";
import Image from "next/image";

export default function ProfileAvatar({ user, size = 40 }) {
  const initials = (user?.full_name || "User").split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: "28%", overflow: "hidden", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#780110", color: "#F8F7F2", fontWeight: 700 }}>
    {user?.profile_photo ? <Image src={user.profile_photo} alt="" width={size} height={size} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
  </span>;
}
