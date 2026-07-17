import { z } from 'zod';

const presentationSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(700),
  nextStep: z.string().min(1).max(300).nullable(),
});

export class OpenAIProcessingService {
  async improve(input: { status: string; title: string; description: string; facts: string[] }) {
    const apiKey = process.env.TORQUECORE_OPENAI_API_KEY?.trim();
    if (!apiKey) return { title: input.title, description: input.description, nextStep: null };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.TORQUECORE_OPENAI_MODEL ?? 'gpt-5.4-mini',
        input: [
          {
            role: 'system',
            content: 'Return concise Russian shipment status JSON. Never invent facts.',
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
              },
              required: ['title', 'description', 'nextStep'],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { title: input.title, description: input.description, nextStep: null };
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
