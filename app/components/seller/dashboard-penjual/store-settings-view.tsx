"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, ImageIcon, ImagePlus, LocateFixed, MapPin, PenLine, Phone, Sparkles, Store, Trash2, } from "lucide-react";
import { Card } from './Card';
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSellerStoreSettings, updateStoreSettings, STORE_SETTINGS_UPDATED_EVENT, } from "@/lib/store-settings-storage";
import { SELLER_STATUS_UPDATED_EVENT } from '@/hooks/seller/use-seller-status';
import { supabase } from "@/lib/supabase";
import { parseCoordinatePairInput } from "@/lib/location-validation";
import { resolveFormCoordinates } from "@/lib/delivery-map-plan";
import { requestDeviceLocation, type DeviceLocationReason, } from "@/lib/device-location";
const LocationPickerMap = dynamic(() => import("@/app/components/shared/location-picker-map"), {
    ssr: false,
    loading: () => (<Skeleton className="h-[220px] rounded-2xl sm:h-[260px]"/>),
});
const OPEN_TIME_EXAMPLES = [
    { open: "08.00", close: "17.00" },
    { open: "09.00", close: "21.00" },
    { open: "10.00", close: "22.00" },
];
const TIME_PATTERN = /^\d{1,2}\.\d{2}$/;
function parseOpenHours(openHours: string): {
    open: string;
    close: string;
} | null {
    const raw = openHours.trim();
    if (!raw)
        return null;
    const match = raw.match(/^(\d{1,2}\.\d{2})\s*[–-]\s*(\d{1,2}\.\d{2})$/);
    if (!match)
        return null;
    return { open: match[1], close: match[2] };
}
function toMinutes(time: string): number | null {
    const match = time.trim().match(/^(\d{1,2})\.(\d{2})$/);
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59)
        return null;
    return hours * 60 + minutes;
}
interface FormValues {
    storeName: string;
    description: string;
    address: string;
    postalCode: string;
    storePhone: string;
    openTime: string;
    closeTime: string;
    storeLatInput: string;
    storeLngInput: string;
    imageUrl: string;
}
interface FieldErrors {
    storeName?: string;
    openTime?: string;
    closeTime?: string;
    postalCode?: string;
    storePhone?: string;
    coordinates?: string;
}
function buildFormValues(settings: Awaited<ReturnType<typeof getSellerStoreSettings>>): FormValues {
    const parsed = parseOpenHours(settings?.openHours ?? "");
    return {
        storeName: settings?.storeName ?? "",
        description: settings?.description ?? "",
        address: settings?.address ?? "",
        postalCode: settings?.postalCode ?? "",
        storePhone: settings?.phone ?? "",
        openTime: parsed?.open ?? settings?.openHours ?? "",
        closeTime: parsed?.close ?? "",
        storeLatInput: typeof settings?.latitude === "number" ? String(settings.latitude) : "",
        storeLngInput: typeof settings?.longitude === "number" ? String(settings.longitude) : "",
        imageUrl: settings?.image ?? "",
    };
}
function validateForm(values: FormValues): {
    errors: FieldErrors;
    firstInvalidId: string | null;
} {
    const errors: FieldErrors = {};
    if (!values.storeName.trim()) {
        errors.storeName = "Nama toko belum diisi. Pembeli melihat nama ini di katalog.";
    }
    const openTime = values.openTime.trim();
    const closeTime = values.closeTime.trim();
    if (!openTime) {
        errors.openTime = "Jam buka belum diisi. Contoh: 09.00";
    }
    else if (!TIME_PATTERN.test(openTime) || toMinutes(openTime) === null) {
        errors.openTime = "Format jam buka belum benar. Contoh: 09.00";
    }
    if (!closeTime) {
        errors.closeTime = "Jam tutup belum diisi. Contoh: 21.00";
    }
    else if (!TIME_PATTERN.test(closeTime) || toMinutes(closeTime) === null) {
        errors.closeTime = "Format jam tutup belum benar. Contoh: 21.00";
    }
    if (!errors.openTime && !errors.closeTime) {
        const openMinutes = toMinutes(openTime);
        const closeMinutes = toMinutes(closeTime);
        if (openMinutes !== null && closeMinutes !== null && closeMinutes <= openMinutes) {
            errors.closeTime = "Jam tutup harus lebih larut dari jam buka. Contoh: buka 09.00, tutup 21.00.";
        }
    }
    const postal = values.postalCode.trim();
    if (postal !== "" && !/^[0-9]{5}$/.test(postal)) {
        errors.postalCode = "Kode pos harus 5 angka, contoh 16424. Kosongkan saja bila belum tahu.";
    }
    const phone = values.storePhone.trim();
    if (phone !== "" && !/^[0-9+\-\s]{9,16}$/.test(phone)) {
        errors.storePhone = "Nomor telepon harus 9–16 angka. Kosongkan saja bila belum ada.";
    }
    const pair = parseCoordinatePairInput(values.storeLatInput, values.storeLngInput);
    if (!pair.ok) {
        errors.coordinates = pair.error;
    }
    const firstInvalidId = errors.storeName
        ? "settings-store-name"
        : errors.openTime
            ? "settings-open-time"
            : errors.closeTime
                ? "settings-close-time"
                : errors.postalCode
                    ? "settings-postal-code"
                    : errors.storePhone
                        ? "settings-phone"
                        : errors.coordinates
                            ? "settings-latitude"
                            : null;
    return { errors, firstInvalidId };
}
function inputClass(hasError: boolean, disabled = false): string {
    return cn("h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:placeholder:text-muted-foreground/30", hasError ? "border-destructive focus-visible:border-destructive" : "border-border focus-visible:border-primary", disabled && "border-border");
}
function Field({ id, label, hint, error, className, footer, children, }: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    className?: string;
    footer?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (<div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-charcoal-900">
        {label}
      </label>
      {children}
      {error ? (<p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
          {error}
        </p>) : hint ? (<p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-sage-500">
          {hint}
        </p>) : null}
      {footer}
    </div>);
}
function Section({ icon: Icon, title, description, children, }: {
    icon: React.ComponentType<{
        className?: string;
    }>;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (<Card>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon aria-hidden className="h-5 w-5"/>
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-charcoal-900">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-sage-500">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </Card>);
}
function StorePreviewCard({ values, logoPreview }: {
    values: FormValues;
    logoPreview: string | null;
}) {
    const image = logoPreview || values.imageUrl;
    const openHours = values.openTime.trim() && values.closeTime.trim()
        ? `${values.openTime.trim()}–${values.closeTime.trim()}`
        : "Belum diatur";
    const address = [values.address.trim(), values.postalCode.trim()].filter(Boolean).join(", ");
    return (<Card className="overflow-hidden p-0">
      <div className="relative h-24 bg-gradient-to-br from-primary via-primary to-primary-dark">
        <div aria-hidden className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "14px 14px",
        }}/>
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white ring-1 ring-white/25 backdrop-blur-sm">
          <Store aria-hidden className="h-3 w-3"/>
          Pratinjau toko
        </span>
      </div>
      <div className="px-5 pb-5">
        <div className="relative z-10 -mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-secondary shadow-sm">
          {image ? (<img src={image} alt="Logo toko" decoding="async" loading="lazy" className="h-full w-full object-cover"/>) : (<ImageIcon aria-hidden className="h-7 w-7 text-muted-foreground/40"/>)}
        </div>
        <h2 className="mt-3 break-words font-display text-lg font-semibold leading-snug text-charcoal-900">
          {values.storeName.trim() || "Nama toko Anda"}
        </h2>
        <p className="mt-1 line-clamp-3 min-h-[3.25rem] text-sm leading-relaxed text-muted-foreground">
          {values.description.trim() || "Deskripsi singkat toko akan tampil di sini."}
        </p>
        <dl className="mt-4 space-y-3.5 border-t border-border/70 pt-4">
          <div className="flex items-start gap-3">
            <Clock3 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Jam buka</dt>
              <dd className="mt-0.5 text-sm font-medium text-charcoal-900">{openHours}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Alamat</dt>
              <dd className="mt-0.5 break-words text-sm leading-relaxed text-charcoal-900">
                {address || "Belum diisi"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Telepon</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-charcoal-900">
                {values.storePhone.trim() || "Belum diisi"}
              </dd>
            </div>
          </div>
        </dl>
        <p className="mt-4 border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Ringkasan ini mengikuti isian Anda dan tampil di halaman Detail Toko pembeli.
        </p>
      </div>
    </Card>);
}
export function StoreSettingsView() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [editing, setEditing] = useState(false);
    const [values, setValues] = useState<FormValues>({
        storeName: "",
        description: "",
        address: "",
        postalCode: "",
        storePhone: "",
        openTime: "",
        closeTime: "",
        storeLatInput: "",
        storeLngInput: "",
        imageUrl: "",
    });
    const setValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };
    const [gpsStatus, setGpsStatus] = useState<"idle" | "requesting" | "ok" | DeviceLocationReason>("idle");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [showManualCoords, setShowManualCoords] = useState(false);
    const savedValuesRef = useRef<FormValues | null>(null);
    const storePickerPoint = resolveFormCoordinates(values.storeLatInput, values.storeLngInput, parseCoordinatePairInput);
    const storePickerLat = storePickerPoint?.latitude ?? null;
    const storePickerLng = storePickerPoint?.longitude ?? null;
    const [savedPair, setSavedPair] = useState<{
        lat: number | null;
        lng: number | null;
    }>({
        lat: null,
        lng: null,
    });
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const applyValues = (next: FormValues) => {
        setValues(next);
        setShowManualCoords(next.storeLatInput.trim() !== "" || next.storeLngInput.trim() !== "");
    };
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const settings = await getSellerStoreSettings();
            if (cancelled)
                return;
            const loaded = buildFormValues(settings);
            applyValues(loaded);
            savedValuesRef.current = loaded;
            setSavedPair({
                lat: typeof settings?.latitude === "number" ? settings.latitude : null,
                lng: typeof settings?.longitude === "number" ? settings.longitude : null,
            });
            setLoading(false);
        };
        load();
        const onStoreUpdated = () => {
            void load();
        };
        window.addEventListener(STORE_SETTINGS_UPDATED_EVENT, onStoreUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener(STORE_SETTINGS_UPDATED_EVENT, onStoreUpdated);
        };
    }, []);
    const savedValues = savedValuesRef.current;
    const isDirty = logoFile !== null ||
        (savedValues !== null && JSON.stringify(values) !== JSON.stringify(savedValues));
    const showSavedMessage = message !== "" && !isDirty;
    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            setError("Berkas yang dipilih harus berupa gambar (PNG atau JPG).");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError("Ukuran gambar terlalu besar. Maksimal 2MB.");
            return;
        }
        setError("");
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    }
    async function handleUseDeviceLocation() {
        setGpsStatus("requesting");
        const result = await requestDeviceLocation();
        if (!result.ok) {
            setGpsStatus(result.reason);
            return;
        }
        setValue("storeLatInput", result.latitude.toFixed(6));
        setValue("storeLngInput", result.longitude.toFixed(6));
        setGpsStatus("ok");
    }
    async function handleSave() {
        if (!editing || saving)
            return;
        setMessage("");
        setError("");
        const { errors, firstInvalidId } = validateForm(values);
        setFieldErrors(errors);
        if (firstInvalidId) {
            if (errors.coordinates)
                setShowManualCoords(true);
            setError("Beberapa isian belum benar. Periksa tanda merah di bawah isian terkait.");
            document.getElementById(firstInvalidId)?.focus();
            return;
        }
        setSaving(true);
        try {
            let finalImage = values.imageUrl;
            if (logoFile) {
                const { data: { session }, } = await supabase.auth.getSession();
                const uid = session?.user.id;
                if (!uid)
                    throw new Error("Sesi berakhir. Silakan masuk kembali.");
                const ext = (logoFile.name.split(".").pop() ?? "png").toLowerCase();
                const path = `logos/${uid}-${Date.now()}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from("umkm-logos")
                    .upload(path, logoFile, {
                    contentType: logoFile.type || "image/png",
                });
                if (uploadError) {
                    throw new Error(`Gagal mengunggah logo: ${uploadError.message}`);
                }
                const { data: { publicUrl }, } = supabase.storage.from("umkm-logos").getPublicUrl(path);
                finalImage = publicUrl;
            }
            const openHours = `${values.openTime.trim()}–${values.closeTime.trim()}`;
            const postalTrimmed = values.postalCode.trim();
            const phoneTrimmed = values.storePhone.trim();
            const coordinatePair = parseCoordinatePairInput(values.storeLatInput, values.storeLngInput);
            if (!coordinatePair.ok) {
                setError(coordinatePair.error);
                setFieldErrors({ coordinates: coordinatePair.error });
                setShowManualCoords(true);
                return;
            }
            const ok = await updateStoreSettings({
                storeName: values.storeName.trim(),
                description: values.description.trim(),
                address: values.address.trim(),
                image: finalImage || undefined,
                openHours,
                postalCode: postalTrimmed === "" ? null : postalTrimmed,
                phone: phoneTrimmed === "" ? null : phoneTrimmed,
                latitude: coordinatePair.latitude,
                longitude: coordinatePair.longitude,
            });
            if (!ok)
                throw new Error("Gagal menyimpan pengaturan toko.");
            const saved: FormValues = {
                storeName: values.storeName.trim(),
                description: values.description.trim(),
                address: values.address.trim(),
                postalCode: postalTrimmed,
                storePhone: phoneTrimmed,
                openTime: values.openTime.trim(),
                closeTime: values.closeTime.trim(),
                storeLatInput: coordinatePair.latitude === null ? "" : String(coordinatePair.latitude),
                storeLngInput: coordinatePair.longitude === null ? "" : String(coordinatePair.longitude),
                imageUrl: finalImage,
            };
            applyValues(saved);
            savedValuesRef.current = saved;
            setSavedPair({ lat: coordinatePair.latitude, lng: coordinatePair.longitude });
            setLogoFile(null);
            setLogoPreview(null);
            setErrorsCleanup();
            setEditing(false);
            setMessage("Perubahan tersimpan. Toko Anda langsung tampil dengan data baru.");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
        }
        finally {
            setSaving(false);
        }
    }
    function setErrorsCleanup() {
        setFieldErrors({});
        setError("");
    }
    function handleDiscard() {
        if (savedValuesRef.current)
            applyValues(savedValuesRef.current);
        setLogoFile(null);
        setLogoPreview(null);
        setGpsStatus("idle");
        setErrorsCleanup();
        setMessage("");
    }
    function handleCancelEdit() {
        handleDiscard();
        setEditing(false);
    }
    function handleStartEdit() {
        setEditing(true);
        setMessage("");
        setError("");
        requestAnimationFrame(() => {
            document.getElementById("settings-store-name")?.focus();
        });
    }
    async function handleDeleteStore() {
        if (deleting)
            return;
        setDeleting(true);
        setDeleteError("");
        try {
            const { data: { session }, } = await supabase.auth.getSession();
            const uid = session?.user.id;
            if (!uid)
                throw new Error("Sesi berakhir. Silakan masuk kembali.");
            const { error: delError } = await supabase.from("umkm_profiles").delete().eq("user_id", uid);
            if (delError)
                throw new Error(delError.message);
            window.dispatchEvent(new Event(SELLER_STATUS_UPDATED_EVENT));
            router.replace("/home");
        }
        catch (err) {
            setDeleteError(err instanceof Error ? err.message : "Terjadi kesalahan.");
            setDeleting(false);
        }
    }
    const openTimeError = fieldErrors.openTime;
    const closeTimeError = fieldErrors.closeTime;
    const formLocked = !editing || saving;
    return (<div className="pb-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight text-primary">
            Profil Toko
          </h1>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Kelola identitas, jam buka, dan lokasi toko. Perubahan langsung tampil di beranda dan halaman Detail Toko pembeli.
          </p>
        </div>
        {!loading && (<div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {editing ? (<button type="button" onClick={handleCancelEdit} disabled={saving} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-charcoal-700 shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
                Batal
              </button>) : (<button type="button" onClick={handleStartEdit} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <PenLine aria-hidden className="h-4 w-4"/>
                Edit profil
              </button>)}
          </div>)}
      </header>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-start xl:gap-5">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          {loading ? (<Card className="overflow-hidden p-0">
              <Skeleton className="h-24 rounded-none"/>
              <div className="space-y-3 px-5 pb-5">
                <Skeleton className="-mt-10 h-20 w-20 rounded-2xl border-4 border-white"/>
                <Skeleton className="h-5 w-40"/>
                <Skeleton className="h-4 w-full"/>
                <Skeleton className="h-4 w-3/4"/>
                <Skeleton className="mt-4 h-4 w-full rounded-xl"/>
                <Skeleton className="h-10 w-full rounded-xl"/>
                <Skeleton className="h-10 w-full rounded-xl"/>
              </div>
            </Card>) : (<>
              <StorePreviewCard values={values} logoPreview={logoPreview}/>
              <Card className="hidden border-dashed bg-white/70 p-4 shadow-none xl:block">
                <p className="flex items-center gap-2 text-xs font-semibold text-charcoal-900">
                  <Sparkles aria-hidden className="h-4 w-4 text-caramel-dark"/>
                  Agar toko mudah ditemukan
                </p>
                <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                  <li className="flex gap-2"><span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary"/><span>Pakai foto persegi agar logo tampil rapi di katalog.</span></li>
                  <li className="flex gap-2"><span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary"/><span>Tulis satu–dua kalimat tentang menu andalan toko.</span></li>
                  <li className="flex gap-2"><span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary"/><span>Tandai titik lokasi toko supaya ongkir lebih akurat.</span></li>
                </ul>
              </Card>
            </>)}
        </aside>

        <div className="min-w-0 space-y-4 xl:order-2">
          {loading ? (<Card>
              <div role="status" aria-label="Memuat pengaturan toko" className="space-y-4">
                {[0, 1, 2, 3].map((i) => (<Skeleton key={i} className="h-16 rounded-2xl"/>))}
              </div>
            </Card>) : (<form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!editing)
                    return;
                void handleSave();
            }} noValidate>
          
          <Section icon={Store} title="Identitas toko" description="Nama dan foto yang pertama kali dilihat pembeli.">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/40 px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                  <ImageIcon aria-hidden className="h-4 w-4"/>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-charcoal-900">Foto toko</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-sage-500">
                    Tampil di pratinjau dan halaman toko. PNG/JPG maks. 2MB, sebaiknya persegi.
                  </p>
                </div>
              </div>
              {editing ? (<button type="button" onClick={() => logoInputRef.current?.click()} disabled={saving} className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
                  <ImagePlus aria-hidden className="h-3.5 w-3.5"/>
                  {logoPreview || values.imageUrl ? "Ganti foto" : "Unggah foto"}
                </button>) : (<p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  Klik “Edit profil” untuk mengganti.
                </p>)}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handleLogoChange}/>
            </div>

            <Field id="settings-store-name" label="Nama toko" hint="Nama yang tampil di katalog, keranjang, dan struk pesanan." error={fieldErrors.storeName}>
              <input id="settings-store-name" type="text" autoComplete="organization" value={values.storeName} onChange={(e) => setValue("storeName", e.target.value)} placeholder="Contoh: Warung Bu Sari" disabled={formLocked} aria-invalid={fieldErrors.storeName ? true : undefined} aria-describedby={fieldErrors.storeName ? "settings-store-name-error" : undefined} className={inputClass(Boolean(fieldErrors.storeName), formLocked)}/>
            </Field>

            <Field id="settings-description" label="Deskripsi singkat" hint="Satu-dua kalimat tentang toko Anda. Boleh dikosongkan.">
              <textarea id="settings-description" rows={3} value={values.description} onChange={(e) => setValue("description", e.target.value)} placeholder="Contoh: Masakan rumahan segar, dimasak setiap pagi." disabled={formLocked} className={cn(inputClass(false, formLocked), "h-auto resize-none py-2.5 leading-relaxed disabled:bg-muted/50 disabled:text-muted-foreground")}/>
            </Field>
          </Section>

          
          <Section icon={Clock3} title="Jam operasional" description="Pembeli bisa melihat jam ini, jadi mereka tahu kapan bisa memesan.">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <Field id="settings-open-time" label="Jam toko buka" hint="Tulis jam buka dalam 24 jam. Contoh: 09.00" error={openTimeError}>
                <input id="settings-open-time" type="text" inputMode="numeric" value={values.openTime} onChange={(e) => setValue("openTime", e.target.value)} placeholder="09.00" disabled={formLocked} aria-required="true" aria-invalid={openTimeError ? true : undefined} aria-describedby={openTimeError ? "settings-open-time-error" : "settings-open-time-hint"} className={inputClass(Boolean(openTimeError), formLocked)}/>
              </Field>

              <Field id="settings-close-time" label="Jam toko tutup" hint="Tulis jam tutup, harus lebih larut dari jam buka. Contoh: 21.00" error={closeTimeError}>
                <input id="settings-close-time" type="text" inputMode="numeric" value={values.closeTime} onChange={(e) => setValue("closeTime", e.target.value)} placeholder="21.00" disabled={formLocked} aria-required="true" aria-invalid={closeTimeError ? true : undefined} aria-describedby={closeTimeError ? "settings-close-time-error" : "settings-close-time-hint"} className={inputClass(Boolean(closeTimeError), formLocked)}/>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-sage-500">Isi cepat:</span>
              {OPEN_TIME_EXAMPLES.map((example) => {
                const active = values.openTime === example.open && values.closeTime === example.close;
                return (<button key={`${example.open}-${example.close}`} type="button" disabled={formLocked} onClick={() => {
                        setValue("openTime", example.open);
                        setValue("closeTime", example.close);
                    }} aria-label={`Pakai contoh buka ${example.open} tutup ${example.close}`} className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50", active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-white text-charcoal-700 hover:bg-secondary")}>
                    {example.open}–{example.close}
                  </button>);
            })}
              {(values.openTime || values.closeTime) && (<span className="ml-1 text-xs font-medium text-charcoal-700">
                  Ditampilkan ke pembeli: {values.openTime || "?"}–{values.closeTime || "?"}
                </span>)}
            </div>
          </Section>

          
          <Section icon={MapPin} title="Lokasi dan kontak" description="Alamat dipakai pembeli dan kurir untuk menemukan toko Anda.">
            <Field id="settings-address" label="Alamat toko" hint="Tulis alamat selengkap mungkin, termasuk nama jalan dan patokan bila ada.">
              <input id="settings-address" type="text" autoComplete="street-address" value={values.address} onChange={(e) => setValue("address", e.target.value)} placeholder="Jl. Melati No. 123, dekat pasar" disabled={formLocked} className={inputClass(false, formLocked)}/>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <Field id="settings-postal-code" label="Kode pos" hint="5 angka. Dipakai untuk menghitung ongkir ekspedisi." error={fieldErrors.postalCode}>
                <input id="settings-postal-code" type="text" autoComplete="postal-code" inputMode="numeric" maxLength={5} value={values.postalCode} onChange={(e) => setValue("postalCode", e.target.value)} placeholder="16424" disabled={formLocked} aria-invalid={fieldErrors.postalCode ? true : undefined} aria-describedby={fieldErrors.postalCode ? "settings-postal-code-error" : "settings-postal-code-hint"} className={inputClass(Boolean(fieldErrors.postalCode), formLocked)}/>
              </Field>

              <Field id="settings-phone" label="Nomor telepon toko" hint="Supaya kurir bisa menghubungi Anda saat mengantar." error={fieldErrors.storePhone}>
                <input id="settings-phone" type="tel" autoComplete="tel" value={values.storePhone} onChange={(e) => setValue("storePhone", e.target.value)} placeholder="08xxxxxxxxxx" disabled={formLocked} aria-invalid={fieldErrors.storePhone ? true : undefined} aria-describedby={fieldErrors.storePhone ? "settings-phone-error" : "settings-phone-hint"} className={inputClass(Boolean(fieldErrors.storePhone), formLocked)}/>
              </Field>
            </div>

            
            <div className="rounded-2xl border border-sage-100 bg-secondary p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-charcoal-900">Titik lokasi toko</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-sage-500">
                    Dipakai agar jarak dan ongkir ke pembeli lebih akurat. Cukup tandai titik
                    toko Anda di peta, atau pakai lokasi saat ini ketika Anda berada di toko.
                  </p>
                </div>
                <button type="button" onClick={() => void handleUseDeviceLocation()} disabled={formLocked || gpsStatus === "requesting"} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100">
                  <LocateFixed aria-hidden className="h-4 w-4"/>
                  {gpsStatus === "requesting" ? "Mencari…" : "Pakai lokasi saat ini"}
                </button>
              </div>

              {gpsStatus === "denied" && (<p className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium leading-relaxed text-destructive ring-1 ring-destructive/20">
                  <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Izin lokasi ditolak. Anda masih bisa menggeser peta ke titik toko, atau mengisi
                  manual di bawah.
                </p>)}
              {gpsStatus === "unavailable" && (<p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-700 ring-1 ring-amber-200">
                  <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Lokasi perangkat tidak terbaca. Geser peta ke titik toko, atau isi manual di
                  bawah.
                </p>)}
              {gpsStatus === "ok" && (<p className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium leading-relaxed text-primary ring-1 ring-primary/20">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Titik dari perangkat sudah terisi. Periksa posisinya di peta, lalu simpan.
                </p>)}

              <div className={cn("mt-3 overflow-hidden rounded-2xl border border-border bg-white", formLocked && "pointer-events-none opacity-60")} aria-hidden={formLocked}>
                <LocationPickerMap latitude={storePickerLat} longitude={storePickerLng} initialLatitude={savedPair.lat} initialLongitude={savedPair.lng} onPick={(lat, lng) => {
                if (!editing)
                    return;
                setValue("storeLatInput", lat.toFixed(6));
                setValue("storeLngInput", lng.toFixed(6));
                setGpsStatus("idle");
            }}/>
              </div>
              <p className="mt-2 text-xs text-sage-500">
                {storePickerPoint
                ? "Titik sudah ditandai. Geser peta bila perlu, lalu simpan."
                : "Ketuk peta untuk menandai titik toko Anda."}
              </p>

              <button type="button" onClick={() => setShowManualCoords((prev) => !prev)} disabled={formLocked} aria-expanded={showManualCoords} className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
                {showManualCoords ? "Sembunyikan isian manual" : "Isi manual (khusus yang tahu angkanya)"}
              </button>

              {showManualCoords && (<div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field id="settings-latitude" label="Latitude" hint="Contoh: -6.20000" error={fieldErrors.coordinates}>
                    <input id="settings-latitude" type="text" inputMode="decimal" value={values.storeLatInput} onChange={(e) => setValue("storeLatInput", e.target.value)} placeholder="-6.20000" disabled={formLocked} aria-invalid={fieldErrors.coordinates ? true : undefined} aria-describedby={fieldErrors.coordinates ? "settings-latitude-error" : "settings-latitude-hint"} className={inputClass(Boolean(fieldErrors.coordinates), formLocked)}/>
                  </Field>
                  <Field id="settings-longitude" label="Longitude" hint="Contoh: 106.81667">
                    <input id="settings-longitude" type="text" inputMode="decimal" value={values.storeLngInput} onChange={(e) => setValue("storeLngInput", e.target.value)} placeholder="106.81667" disabled={formLocked} aria-describedby="settings-longitude-hint" className={inputClass(Boolean(fieldErrors.coordinates), formLocked)}/>
                  </Field>
                </div>)}
            </div>
          </Section>

          
          {error && (<div role="alert" className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/>
              <p className="leading-relaxed">{error}</p>
            </div>)}
          {showSavedMessage && (<div role="status" className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/>
              <p className="leading-relaxed">{message}</p>
            </div>)}

          
            {editing && (isDirty || saving) && (<div className="sticky bottom-20 z-20 mr-16 lg:bottom-6 lg:mr-24">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-lg shadow-primary/5 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-medium text-charcoal-700">
                {saving ? ("Menyimpan perubahan…") : (<>
                    <PenLine aria-hidden className="h-4 w-4 shrink-0 text-amber-600"/>
                    Perubahan belum disimpan.
                  </>)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleDiscard} disabled={saving} className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-charcoal-700 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100">
                  Batalkan
                </button>
                <button type="submit" disabled={saving || !editing} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100">
                  {saving ? "Menyimpan…" : "Simpan perubahan"}
                </button>
              </div>
            </div>
          </div>)}

          </form>)}
          
          {!loading && (<Card className="border-destructive/25">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5"/>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold text-destructive">Hapus toko</h2>
              <p className="mt-1 text-sm leading-relaxed text-sage-500">
                Seluruh menu, pesanan, ulasan, pengikut, dan langganan toko ikut terhapus dan{" "}
                <strong className="font-semibold text-destructive">tidak bisa dikembalikan</strong>.
                Akun Anda tetap aktif, jadi Anda bisa membuka toko baru kapan saja.
              </p>

              {deleteError && (<p role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {deleteError}
                </p>)}

              {!confirmingDelete ? (<button type="button" onClick={() => {
                    setDeleteError("");
                    setConfirmingDelete(true);
                }} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-destructive/35 bg-white px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                  <Trash2 aria-hidden className="h-4 w-4"/>
                  Hapus toko ini
                </button>) : (<div className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 p-4">
                  <p className="text-sm font-semibold text-destructive">
                    Yakin ingin menghapus {values.storeName ? `“${values.storeName}”` : "toko ini"}{" "}
                    secara permanen?
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-destructive/80">
                    Tindakan ini langsung berjalan dan tidak bisa dibatalkan.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={deleting} onClick={() => void handleDeleteStore()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-destructive px-4 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100">
                      <Trash2 aria-hidden className="h-4 w-4"/>
                      {deleting ? "Menghapus…" : "Ya, hapus permanen"}
                    </button>
                    <button type="button" disabled={deleting} onClick={() => setConfirmingDelete(false)} className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-charcoal-700 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100">
                      Batal
                    </button>
                  </div>
                </div>)}
            </div>
          </div>
          </Card>)}
        </div>
      </div>
    </div>);
}
