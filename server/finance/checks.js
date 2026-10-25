// Facts about fixed-price services, read from their own sources rather than
// typed in: a domain's registrar and expiry from the public registry (RDAP,
// no key), and the Brevo plan from Brevo's account API (the app's existing
// BREVO_API_KEY). The plan prices themselves still come from the invoice.

import { env, requestJson } from './http.js';

const rdapUrl = (domain) =>
  domain.endsWith('.cz') ? `https://rdap.nic.cz/domain/${domain}` : `https://rdap.org/domain/${domain}`;

export async function lookupDomain(domain) {
  const body = await requestJson(rdapUrl(domain), { headers: { Accept: 'application/rdap+json, application/json' } });
  const event = (action) => body?.events?.find((item) => item.eventAction === action)?.eventDate ?? null;
  const registrar = body?.entities?.find((entity) => entity.roles?.includes('registrar'));
  const registrarName = registrar?.vcardArray?.[1]?.find((field) => field[0] === 'fn')?.[3] ?? registrar?.handle ?? null;
  return {
    registrar: registrarName,
    registeredAt: event('registration'),
    expiresAt: event('expiration'),
  };
}

export const isBrevoConfigured = () => Boolean(env('BREVO_API_KEY'));

// Only the plan is kept; the account's name and address are not needed here.
export async function lookupBrevoPlan() {
  const body = await requestJson('https://api.brevo.com/v3/account', {
    headers: { 'api-key': env('BREVO_API_KEY'), accept: 'application/json' },
  });
  return {
    plans: (body?.plan ?? []).map((plan) => ({
      type: plan.type ?? null,
      credits: plan.credits ?? null,
      creditsType: plan.creditsType ?? null,
      startDate: plan.startDate ?? null,
      endDate: plan.endDate ?? null,
    })),
  };
}
