import { z } from 'zod';

const presentationSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(700),
  nextStep: z.string().min(1).max(300).nullable(),
  carrier: z.string().min(1).max(160).nullable(),
  location: z.string().min(1).max(200).nullable(),
  origin: z.string().min(1).max(160).nullable(),
  destination: z.string().min(1).max(160).nullable(),
  eventAt: z.string().min(1).max(120).nullable(),
});

export type ImprovedPresentation = z.infer<typeof presentationSchema>;

export class OpenAIProcessingService {
  async improve(input: {
    status: string;
    title: string;
    description: string;
    facts: string[];
  }): Promise<ImprovedPresentation> {
    const fallback: ImprovedPresentation = {
      title: input.title,
      description: input.description,
      nextStep: null,
      carrier: null,
      location: null,
      origin: null,
      destination: null,
      eventAt: null,
    };
    const apiKey = process.env.TORQUECORE_OPENAI_API_KEY?.trim();
    if (!apiKey) return fallback;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.TORQUECORE_OPENAI_MODEL ?? 'gpt-5.4-mini',
        input: [
          {
            role: 'system',
            content:
              'Return concise Russian shipment status JSON built only from the provided facts. ' +
              'Never invent facts. Translate technical statuses and foreign-language locations into ' +
              'natural Russian, but keep carrier names unchanged. Fill carrier, location (the latest ' +
              'confirmed place), origin and destination, and eventAt (the latest confirmed event date/time) ' +
              'only when a fact states them explicitly; otherwise use null. Set origin/destination only when ' +
              'a fact is explicitly labelled From/Origin or To/Destination — never treat a standalone ' +
              'location as a route endpoint.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'shipment_presentation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                nextStep: { type: ['string', 'null'] },
                carrier: { type: ['string', 'null'] },
                location: { type: ['string', 'null'] },
                origin: { type: ['string', 'null'] },
                destination: { type: ['string', 'null'] },
                eventAt: { type: ['string', 'null'] },
              },
              required: [
                'title',
                'description',
                'nextStep',
                'carrier',
                'location',
                'origin',
                'destination',
                'eventAt',
              ],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const text =
      body.output_text ??
      body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')
        ?.text;
    return presentationSchema.parse(JSON.parse(text ?? '{}'));
  }
}
