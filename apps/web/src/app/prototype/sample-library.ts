export type Chapter = { id: string; title: string; text: string; changed?: boolean };
export type ItemKind = "multiple-choice" | "short-answer" | "vocabulary" | "summary";
export type Item = { id: string; chapterId: string; kind: ItemKind; prompt: string; answer: string; choices?: string[]; correct?: number; explanation?: string };
export type Guide = { id: string; name: string; date: string; items: Item[] };
export type Book = { id: string; title: string; author: string; source: string; chapters: Chapter[]; guides: Guide[] };

export const labels: Record<ItemKind, string> = {
  "multiple-choice": "Multiple choice", "short-answer": "Short answer", vocabulary: "Vocabulary", summary: "Summary"
};
export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const chapters: Chapter[] = [
  { id: "garden-1", title: "The door behind the shelves", text: `Mina had visited the village library every Saturday since she learned to read. She knew the quiet corner beside the window, the creaking stairs, and the shelf where the atlases lived. But she had never noticed the narrow green door behind the gardening books.

That morning, a small brass key rested on the librarian's desk. A paper label was tied to it with a piece of blue thread. It said, simply, “For someone who will look after what they find.”

“Is it a puzzle?” Mina asked.

The librarian smiled. “Perhaps. Some doors open when we are ready to take responsibility for what is on the other side.”

Mina turned the key. Beyond the door lay a walled garden, tangled and quiet. A cracked fountain stood in the middle. Wildflowers leaned across the path, and a robin watched from a crooked apple tree.

She had expected treasure. Instead, she found work to do. Yet as the sunlight fell across the old stone wall, she began to think the two might be the same thing.` },
  { id: "garden-2", title: "A map of small things", text: `The following Saturday, Mina brought a notebook. She drew a map of the garden, marking the apple tree, the empty pond, and the patches where the earth was dry. At first she wanted to change everything at once.

“Start with something small enough to finish,” the librarian suggested.

Mina chose the path. She lifted fallen branches and carefully moved the stones that had rolled into the grass. When a neighbour stopped to watch, she asked him where the old path had once led.

He remembered a bench beneath the apple tree. Together, they uncovered its wooden seat. The garden began to feel less like a secret and more like a place that had been waiting for people to return.` },
  { id: "garden-3", title: "After the rain", text: `A sudden storm arrived on Friday night. By morning, the garden gate hung from one hinge and the path was covered in leaves. Mina stood in the doorway, wondering whether all her work had been wasted.

Then the neighbour appeared with a hammer. The librarian carried a basket of gloves, and two children from Mina's class brought a broom.

They worked slowly. One child held the gate while the neighbour repaired it. Mina cleared the drain beside the fountain. By afternoon, water was running into the pond again.

The garden was different from the one Mina had first imagined. It was no longer hers alone. Watching her friends sit beneath the apple tree, she decided that was the best change of all.` }
];

export function sampleItems(chapter: Chapter): Item[] {
  const opening = chapter.text.split(/(?<=[.!?])\s+/)[0] || chapter.text;
  return [
    { id: `${chapter.id}-mc`, chapterId: chapter.id, kind: "multiple-choice", prompt: "Which detail is supported by the passage?", choices: [opening, "The story takes place aboard a ship.", "The narrator decides to leave the village forever."], correct: 0, answer: opening, explanation: "The first choice repeats a detail from the opening of the passage." },
    { id: `${chapter.id}-sa`, chapterId: chapter.id, kind: "short-answer", prompt: "How does the main character respond to a challenge in this chapter? Use a detail from the text.", answer: "Name the challenge, describe the response, and support the explanation with evidence from the passage." },
    { id: `${chapter.id}-summary`, chapterId: chapter.id, kind: "summary", prompt: "Chapter overview", answer: opening }
  ];
}

const gardenItems: Item[] = [
  { id: "q-1", chapterId: "garden-1", kind: "multiple-choice", prompt: "What makes Mina curious about the brass key?", choices: ["It belongs to a visitor she has never met.", "Its label suggests there is something to care for.", "It is hidden inside one of the library books.", "The librarian asks her to take it home."], correct: 1, answer: "Its label suggests there is something to care for.", explanation: "The label connects opening the door with looking after what is found beyond it." },
  { id: "q-2", chapterId: "garden-1", kind: "multiple-choice", prompt: "What does Mina begin to understand at the end of the chapter?", choices: ["A valuable discovery can also involve responsibility.", "The librarian has made a mistake.", "The garden is too damaged to restore.", "The key is the treasure she was looking for."], correct: 0, answer: "A valuable discovery can also involve responsibility.", explanation: "Her thoughts shift from finding treasure to seeing value in caring for the garden." },
  { id: "q-3", chapterId: "garden-1", kind: "short-answer", prompt: "Why might the author describe the garden as both tangled and quiet?", answer: "The description suggests neglect, but also creates a sense of possibility. Students may connect the garden's condition with Mina's decision to care for it." },
  { id: "v-1", chapterId: "garden-1", kind: "vocabulary", prompt: "responsibility", answer: "A duty to care for something or make sure a task is done.", explanation: "Some doors open when we are ready to take responsibility for what is on the other side." },
  { id: "v-2", chapterId: "garden-1", kind: "vocabulary", prompt: "tangled", answer: "Twisted together in an untidy or complicated way.", explanation: "Beyond the door lay a walled garden, tangled and quiet." },
  { id: "s-1", chapterId: "garden-1", kind: "summary", prompt: "Chapter overview", answer: "Mina discovers a forgotten garden behind the library. A message on the key invites her to care for it, and she begins to see that responsibility can be part of a valuable discovery." },
  ...chapters.slice(1).flatMap(sampleItems)
];

export function initialLibrary(): Book[] {
  const garden: Book = { id: "garden", title: "The Library Garden", author: "An original sample reading", source: "the-library-garden.txt", chapters, guides: [
    { id: "guide-2", name: "Class discussion", date: "Edited today", items: gardenItems },
    { id: "guide-1", name: "First draft", date: "Earlier version", items: chapters.flatMap(sampleItems) }
  ] };
  const secondChapters = [{ id: "crossing-1", title: "The last ferry", text: "The ferry waited at the end of the pier while snow settled on the water. Daniel held a letter he had promised to deliver before nightfall. When the captain warned him that the return journey might be delayed, he thought carefully about the promise he had made. He stepped aboard, carrying a small bag and enough food to share." }];
  return [garden, { id: "crossing", title: "A Winter Crossing", author: "An original sample reading", source: "a-winter-crossing.txt", chapters: secondChapters, guides: [] }];
}

export function splitText(text: string): Chapter[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const headings = [...normalized.matchAll(/^chapter\s+[^\n]{1,80}$/gim)];
  if (!headings.length) return [{ id: crypto.randomUUID(), title: "Opening chapter", text: normalized }];
  const result: Chapter[] = [];
  const opening = normalized.slice(0, headings[0].index).trim();
  if (opening) result.push({ id: crypto.randomUUID(), title: "Opening pages", text: opening });
  headings.forEach((heading, i) => {
    const body = normalized.slice(heading.index! + heading[0].length, headings[i + 1]?.index ?? normalized.length).trim();
    result.push({ id: crypto.randomUUID(), title: heading[0].replace(/^chapter\s+(?:\d+|[a-z]+)\s*[:.\-–—]?\s*/i, "") || heading[0], text: body });
  });
  return result;
}
