type TranscribeOptions = {
  apiKey: string;
  buffer: Uint8Array;
  filename: string;
  mimeType: string;
  language?: string;
};

type GroqTranscriptionResponse = {
  text?: string;
};

type VisionOptions = {
  apiKey: string;
  base64Image: string;
  mimeType: string;
  prompt?: string;
};

export async function transcribeWithGroq(options: TranscribeOptions): Promise<string> {
  const form = new FormData();
  const blob = new Blob([options.buffer], { type: options.mimeType });

  form.append('file', blob, options.filename);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');

  if (options.language) {
    form.append('language', options.language);
  }

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq STT error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as GroqTranscriptionResponse;
  const text = data.text?.trim();
  if (!text) {
    throw new Error('Groq no devolvió texto en la transcripción.');
  }

  return text;
}

export async function analyzeImageWithGroq(options: VisionOptions): Promise<string> {
  const defaultPrompt =
    'Analiza esta imagen en detalle. Si es una captura de pantalla de código, errores, o una interfaz, describe: 1) Qué se muestra 2) Si hay errores visibles 3) Qué problema identificas. Sé específico y técnico.';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: options.prompt || defaultPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${options.mimeType};base64,${options.base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Vision error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Groq no devolvió análisis de la imagen.');
  }

  return content;
}

type OpenRouterVisionOptions = {
  apiKey: string;
  base64Image: string;
  mimeType: string;
  prompt?: string;
};

export async function analyzeImageWithOpenRouter(options: OpenRouterVisionOptions): Promise<string> {
  const defaultPrompt =
    'Analiza esta imagen en detalle. Si es una captura de pantalla de código, errores, o una interfaz, describe: 1) Qué se muestra 2) Si hay errores visibles 3) Qué problema identificas. Sé específico y técnico.';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: options.prompt || defaultPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${options.mimeType};base64,${options.base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Vision error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter no devolvió análisis de la imagen.');
  }

  return content;
}
