"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressAvatar } from "@/components/address-avatar";
import { domain, profileTypes, buildProfileMessage } from "@/lib/eip712";
import { PROFILE_LIMITS } from "@/lib/profile-fields";
import { useProfile } from "@/lib/use-profiles";
import { shortAddress } from "@/lib/utils";
import { Upload, Loader2, X } from "lucide-react";

// The same numbers the signer truncates to. Kept in one place so the counter
// under the field cannot promise room that normalisation then takes away.
const NAME_MAX = PROFILE_LIMITS.name;
const BIO_MAX = PROFILE_LIMITS.bio;

/**
 * Set up how you appear on this portal.
 *
 * Signed like everything else here, and for the same reason: the name printed
 * beside a proposal is what most readers will actually judge it by, so it has
 * to be a claim the address made rather than a row someone with database
 * access typed. The address stays visible next to the name everywhere it is
 * shown — a display name is a convenience, never the identity.
 */
export function ProfileSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile(address);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Re-seed whenever the sheet opens rather than on every profile change, so
  // a background refetch cannot overwrite half-typed edits.
  useEffect(() => {
    if (!open) return;
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatar(profile?.avatar_url ?? "");
    setTwitter(profile?.twitter ?? "");
    setGithub(profile?.github ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/avatar", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not upload the image.");
      // The upload only produces a URL. It becomes this member's avatar when
      // they sign the profile below, not a moment sooner.
      setAvatar(json.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setUploading(false);
      // Let the same file be chosen again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    if (!address) return;
    setBusy(true);
    try {
      const message = buildProfileMessage({
        from: address,
        displayName,
        bio,
        avatar,
        twitter,
        github,
      });

      const signature = await signTypedDataAsync({
        domain,
        types: profileTypes,
        primaryType: "Profile",
        message,
      });

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { ...message, timestamp: message.timestamp.toString() },
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the profile.");

      // Every list on the page resolves names through some ["profiles", ...]
      // key, so the new name has to reach all of them, not just this sheet's.
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Profile saved.");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save the profile.";
      toast.error(msg.includes("User rejected") ? "Signature cancelled." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your profile</SheetTitle>
          <SheetDescription>
            How you appear beside your proposals and votes. Saving asks for a
            signature — it costs no gas.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="flex items-center gap-3">
            <AddressAvatar address={address ?? ""} src={avatar} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {displayName.trim() || "Unnamed"}
              </p>
              <p className="tabular truncate text-xs text-muted-foreground">
                {address ? shortAddress(address, 6) : ""}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="display-name">Display name</Label>
              <span className="tabular text-[11px] text-muted-foreground">
                {displayName.length}/{NAME_MAX}
              </span>
            </div>
            <Input
              id="display-name"
              value={displayName}
              maxLength={NAME_MAX}
              placeholder="How the DAO knows you"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="bio">Bio</Label>
              <span className="tabular text-[11px] text-muted-foreground">
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <Textarea
              id="bio"
              value={bio}
              maxLength={BIO_MAX}
              rows={3}
              placeholder="What you work on in this DAO."
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Avatar</Label>

            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                {uploading ? "Uploading" : avatar ? "Replace image" : "Upload image"}
              </Button>

              {avatar && !uploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAvatar("")}
                >
                  <X className="mr-1 size-4" />
                  Remove
                </Button>
              )}
            </div>

            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Or paste an image URL
              </summary>
              <Input
                id="avatar"
                value={avatar}
                placeholder="https://…"
                className="mt-2"
                onChange={(e) => setAvatar(e.target.value)}
              />
            </details>

            <p className="text-xs text-muted-foreground">
              PNG, JPEG, GIF or WebP, up to 512 KB. Leave empty to keep the
              avatar your address already resolves to.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="twitter">X / Twitter</Label>
              <Input
                id="twitter"
                value={twitter}
                placeholder="handle"
                onChange={(e) => setTwitter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github">GitHub</Label>
              <Input
                id="github"
                value={github}
                placeholder="handle"
                onChange={(e) => setGithub(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Your address is shown next to your name everywhere it appears. A
            display name identifies you to people who already know you — it is
            never proof of who you are.
          </p>
        </div>

        <SheetFooter>
          <Button onClick={save} disabled={busy || uploading || !address}>
            {busy ? "Waiting for signature" : "Sign and save"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
