import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.date(),
        updatedDate: z.date().optional(),
        heroImage: z.string().optional(),
        tags: z.array(z.string()).default([]),
    }),
});

const portfolio = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.date(),
        heroImage: z.string().optional(),
        tags: z.array(z.string()).default([]),
        link: z.string().url().optional(), // Link to live project
    }),
});

export const collections = {
    blog,
    portfolio,
};
