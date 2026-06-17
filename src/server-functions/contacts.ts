// src/server-functions/contacts.ts
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { normalizeEmail, normalizePhone } from "@/lib/lifecycle-utils";
import type {
  Account,
  CampaignMember,
  ChannelIdentity,
  Contact,
  Deal,
  EngagementEvent,
  Project,
} from "@/lib/types";

type GetContactsInput = {
  account_id?: string;
  owner?: string;
  lifecycle_stage?: string;
  source?: string;
  query?: string;
};

type CreateContactInput = Partial<
  Pick<
    Contact,
    | "account_id"
    | "first_name"
    | "last_name"
    | "full_name"
    | "email"
    | "phone"
    | "title"
    | "owner"
    | "lifecycle_stage"
    | "source"
    | "consent_status"
  >
>;

type AcquisitionContactInput = {
  company_name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  source?: Contact["source"];
  owner?: string | null;
};

export const getContacts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as GetContactsInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("contacts").select("*").order("created_at", { ascending: false });

    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.owner) query = query.eq("owner", data.owner);
    if (data.lifecycle_stage) query = query.eq("lifecycle_stage", data.lifecycle_stage);
    if (data.source) query = query.eq("source", data.source);
    if (data.query) {
      const search = data.query.replace(/[%,]/g, "").trim();
      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
        );
      }
    }

    const { data: contacts, error } = await query;
    if (error) throw new Error(error.message);
    return contacts as Contact[];
  });

export const getContact = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const [
      contactResult,
      identitiesResult,
      timelineResult,
      campaignsResult,
      dealsResult,
      projectsResult,
    ] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", data.id).single(),
      supabase.from("channel_identities").select("*").eq("contact_id", data.id),
      supabase
        .from("engagement_events")
        .select("*")
        .eq("contact_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase.from("campaign_members").select("*").eq("contact_id", data.id),
      supabase
        .from("deals")
        .select("*")
        .eq("contact_id", data.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("*")
        .eq("contact_id", data.id)
        .order("created_at", { ascending: false }),
    ]);

    if (contactResult.error) throw new Error(contactResult.error.message);
    if (identitiesResult.error) throw new Error(identitiesResult.error.message);
    if (timelineResult.error) throw new Error(timelineResult.error.message);
    if (campaignsResult.error) throw new Error(campaignsResult.error.message);
    if (dealsResult.error) throw new Error(dealsResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);

    let account: Account | null = null;
    const contact = contactResult.data as Contact;
    if (contact.account_id) {
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", contact.account_id)
        .maybeSingle();
      if (accountError) throw new Error(accountError.message);
      account = accountData as Account | null;
    }

    return {
      contact,
      account,
      channelIdentities: (identitiesResult.data ?? []) as ChannelIdentity[],
      engagementEvents: (timelineResult.data ?? []) as EngagementEvent[],
      campaignMemberships: (campaignsResult.data ?? []) as CampaignMember[],
      deals: (dealsResult.data ?? []) as Deal[],
      projects: (projectsResult.data ?? []) as Project[],
    };
  });

export const createContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateContactInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        ...data,
        email: normalizeEmail(data.email),
        phone: normalizePhone(data.phone),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return contact as Contact;
  });

export const updateContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Contact> })
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: contact, error } = await supabase
      .from("contacts")
      .update({
        ...(data.updates.account_id !== undefined && { account_id: data.updates.account_id }),
        ...(data.updates.first_name !== undefined && { first_name: data.updates.first_name }),
        ...(data.updates.last_name !== undefined && { last_name: data.updates.last_name }),
        ...(data.updates.full_name !== undefined && { full_name: data.updates.full_name }),
        ...(data.updates.email !== undefined && { email: normalizeEmail(data.updates.email) }),
        ...(data.updates.phone !== undefined && { phone: normalizePhone(data.updates.phone) }),
        ...(data.updates.title !== undefined && { title: data.updates.title }),
        ...(data.updates.owner !== undefined && { owner: data.updates.owner }),
        ...(data.updates.lifecycle_stage !== undefined && {
          lifecycle_stage: data.updates.lifecycle_stage,
        }),
        ...(data.updates.source !== undefined && { source: data.updates.source }),
        ...(data.updates.consent_status !== undefined && {
          consent_status: data.updates.consent_status,
        }),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return contact as Contact;
  });

export const upsertContactFromAcquisition = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AcquisitionContactInput)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const email = normalizeEmail(data.contact_email);
    const phone = normalizePhone(data.contact_phone);

    if (email) {
      const { data: existing, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (existing) {
        const contact = existing as Contact;
        const account = await getAccountForContact(supabase, contact);
        return { contact, account, matchedBy: "email" as const };
      }
    }

    if (phone) {
      const { data: existing, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (existing) {
        const contact = existing as Contact;
        const account = await getAccountForContact(supabase, contact);
        return { contact, account, matchedBy: "phone" as const };
      }
    }

    const { data: existingAccount, error: accountLookupError } = await supabase
      .from("accounts")
      .select("*")
      .ilike("name", data.company_name.trim())
      .maybeSingle();
    if (accountLookupError) throw new Error(accountLookupError.message);

    let account = existingAccount as Account | null;
    if (!account) {
      const { data: createdAccount, error: createAccountError } = await supabase
        .from("accounts")
        .insert({
          name: data.company_name,
          account_owner: data.owner,
        })
        .select()
        .single();
      if (createAccountError) throw new Error(createAccountError.message);
      account = createdAccount as Account;
    }

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        account_id: account.id,
        full_name: data.contact_name,
        email,
        phone,
        source: data.source,
        owner: data.owner,
      })
      .select()
      .single();
    if (contactError) throw new Error(contactError.message);

    return { contact: contact as Contact, account, matchedBy: "created" as const };
  });

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

async function getAccountForContact(
  supabase: SupabaseServerClient,
  contact: Contact,
): Promise<Account | null> {
  if (!contact.account_id) return null;

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", contact.account_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Account | null;
}
