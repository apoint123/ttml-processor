import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { AmllLyricLine, AmllMetadata, TTMLResult } from "@/index";
import { TTMLGenerator, TTMLParser, toTTMLResult } from "@/index";

const XML = readFileSync(
	join(import.meta.dir, "fixtures", "complex-test-song.ttml"),
	"utf-8",
);

describe("TTML Generator Integration Test", () => {
	let parser: TTMLParser;
	let generator: TTMLGenerator;
	let originalResult: TTMLResult;
	let generatedXML: string;
	let parsedGeneratedResult: TTMLResult;

	beforeAll(() => {
		parser = new TTMLParser({ domParser: new DOMParser() });
		generator = new TTMLGenerator({
			domImplementation: new DOMImplementation(),
			xmlSerializer: new XMLSerializer(),
		});

		originalResult = parser.parse(XML);
		generatedXML = generator.generate(originalResult);
		parsedGeneratedResult = parser.parse(generatedXML);
	});

	test("应当成功生成 XML 字符串", () => {
		expect(generatedXML).toBeDefined();
		expect(typeof generatedXML).toBe("string");
		expect(generatedXML.length).toBeGreaterThan(0);
		expect(generatedXML).toContain("<tt");
		expect(generatedXML).toContain("</tt>");
	});

	test("生成的 XML 字符串应与快照匹配", () => {
		expect(generatedXML).toMatchSnapshot();
	});

	test("Metadata: 生成后重新解析的元数据应与原始数据一致", () => {
		expect(parsedGeneratedResult.metadata.language).toBe(
			originalResult.metadata.language,
		);
		expect(parsedGeneratedResult.metadata.timingMode).toBe(
			originalResult.metadata.timingMode,
		);
		expect(parsedGeneratedResult.metadata.title).toEqual(
			originalResult.metadata.title,
		);
		expect(parsedGeneratedResult.metadata.artist).toEqual(
			originalResult.metadata.artist,
		);
		expect(parsedGeneratedResult.metadata.album).toEqual(
			originalResult.metadata.album,
		);
		expect(parsedGeneratedResult.metadata.isrc).toEqual(
			originalResult.metadata.isrc,
		);
		expect(parsedGeneratedResult.metadata.platformIds).toEqual(
			originalResult.metadata.platformIds,
		);
		expect(parsedGeneratedResult.metadata.authorIds).toEqual(
			originalResult.metadata.authorIds,
		);
		expect(parsedGeneratedResult.metadata.authorNames).toEqual(
			originalResult.metadata.authorNames,
		);
		expect(parsedGeneratedResult.metadata.songwriters).toEqual(
			originalResult.metadata.songwriters,
		);
		expect(parsedGeneratedResult.metadata.agents).toEqual(
			originalResult.metadata.agents,
		);
	});

	test("Lines: 生成后重新解析的歌词行数应与原始数据一致", () => {
		expect(parsedGeneratedResult.lines.length).toBe(
			originalResult.lines.length,
		);
	});

	test("Lines: 生成后重新解析的歌词行内容应与原始数据一致", () => {
		for (let i = 0; i < originalResult.lines.length; i++) {
			const originalLine = originalResult.lines[i];
			const generatedLine = parsedGeneratedResult.lines[i];

			expect(generatedLine.id).toBe(originalLine.id);
			expect(generatedLine.startTime).toBe(originalLine.startTime);
			expect(generatedLine.endTime).toBe(originalLine.endTime);
			expect(generatedLine.agentId).toBe(originalLine.agentId);
			expect(generatedLine.songPart).toBe(originalLine.songPart);
			expect(generatedLine.text).toBe(originalLine.text);

			expect(generatedLine.words?.length).toBe(originalLine.words?.length);
			if (originalLine.words && generatedLine.words) {
				for (let j = 0; j < originalLine.words.length; j++) {
					expect(generatedLine.words[j].text).toBe(originalLine.words[j].text);
					expect(generatedLine.words[j].startTime).toBe(
						originalLine.words[j].startTime,
					);
					expect(generatedLine.words[j].endTime).toBe(
						originalLine.words[j].endTime,
					);
				}
			}

			expect(generatedLine.translations?.length).toBe(
				originalLine.translations?.length,
			);
			if (originalLine.translations && generatedLine.translations) {
				for (let j = 0; j < originalLine.translations.length; j++) {
					expect(generatedLine.translations[j].language).toBe(
						originalLine.translations[j].language,
					);
					expect(generatedLine.translations[j].text).toBe(
						originalLine.translations[j].text,
					);
				}
			}

			expect(generatedLine.romanizations?.length).toBe(
				originalLine.romanizations?.length,
			);
			if (originalLine.romanizations && generatedLine.romanizations) {
				for (let j = 0; j < originalLine.romanizations.length; j++) {
					expect(generatedLine.romanizations[j].language).toBe(
						originalLine.romanizations[j].language,
					);
					expect(generatedLine.romanizations[j].text).toBe(
						originalLine.romanizations[j].text,
					);
				}
			}
		}
	});
});

describe("TTML Generator - toTTMLResult Integration Test", () => {
	let generator: TTMLGenerator;
	let parser: TTMLParser;

	beforeAll(() => {
		generator = new TTMLGenerator({
			domImplementation: new DOMImplementation(),
			xmlSerializer: new XMLSerializer(),
		});
		parser = new TTMLParser({ domParser: new DOMParser() });
	});

	test("应当能从 AMLL 数据结构生成 TTMLResult 并成功序列化为 XML", () => {
		const amllMetadata: AmllMetadata[] = [
			{ key: "musicName", value: ["Test Song"] },
			{ key: "artists", value: ["Artist A", "Artist B"] },
		];

		const amllLines: AmllLyricLine[] = [
			{
				startTime: 1000,
				endTime: 3000,
				isBG: false,
				isDuet: false,
				translatedLyric: "你好",
				romanLyric: "ni hao",
				words: [
					{ startTime: 1000, endTime: 2000, word: "你", romanWord: "ni" },
					{ startTime: 2000, endTime: 3000, word: "好", romanWord: "hao" },
				],
			},
			{
				startTime: 3000,
				endTime: 5000,
				isBG: true,
				isDuet: false,
				translatedLyric: "世界",
				romanLyric: "shi jie",
				words: [
					{ startTime: 3000, endTime: 4000, word: "世", romanWord: "shi" },
					{ startTime: 4000, endTime: 5000, word: "界", romanWord: "jie" },
				],
			},
		];

		const ttmlResult = toTTMLResult(amllLines, amllMetadata, {
			mainLanguage: "zh",
			translationLanguage: "en",
			romanizationLanguage: "zh-Latn",
		});

		expect(ttmlResult.metadata.title).toEqual(["Test Song"]);
		expect(ttmlResult.metadata.artist).toEqual(["Artist A", "Artist B"]);
		expect(ttmlResult.lines.length).toBe(1);
		expect(ttmlResult.lines[0].backgroundVocals?.length).toBe(1);

		const xml = generator.generate(ttmlResult);
		expect(xml).toContain("<tt");
		expect(xml).toContain("Test Song");
		expect(xml).toContain("Artist A");
		expect(xml).toMatchSnapshot();

		const parsed = parser.parse(xml);
		expect(parsed.metadata.title).toEqual(["Test Song"]);
		expect(parsed.lines.length).toBe(1);
		expect(parsed.lines[0].text).toBe("你好");
		expect(parsed.lines[0].backgroundVocals?.[0].text).toBe("世界");
	});
});

describe("TTML Generator - 行 ID 自动生成逻辑测试", () => {
	let generator: TTMLGenerator;

	beforeAll(() => {
		generator = new TTMLGenerator({
			domImplementation: new DOMImplementation(),
			xmlSerializer: new XMLSerializer(),
		});
	});

	const createMockResult = (
		lines: Partial<TTMLResult["lines"][0]>[],
	): TTMLResult => ({
		metadata: { agents: { v1: { id: "v1" } } },
		lines: lines as TTMLResult["lines"],
	});

	test("当所有行都没有提供 id 时，应自动生成从 L1 开始的行号", () => {
		const result = createMockResult([
			{ startTime: 0, endTime: 1000, text: "Line 1" },
			{ startTime: 1000, endTime: 2000, text: "Line 2" },
		]);

		const xml = generator.generate(result);

		expect(xml).toContain('itunes:key="L1"');
		expect(xml).toContain('itunes:key="L2"');
	});

	test("当部分行提供 id，部分没有时，应忽略已提供的 id 并统一重新生成行号", () => {
		const result = createMockResult([
			{ id: "Custom1", startTime: 0, endTime: 1000, text: "Line 1" },
			{ startTime: 1000, endTime: 2000, text: "Line 2" },
			{ id: "Custom3", startTime: 2000, endTime: 3000, text: "Line 3" },
		]);

		const xml = generator.generate(result);

		expect(xml).not.toContain('"Custom1"');
		expect(xml).not.toContain('"Custom3"');

		expect(xml).toContain('itunes:key="L1"');
		expect(xml).toContain('itunes:key="L2"');
		expect(xml).toContain('itunes:key="L3"');
	});

	test("当所有行都提供了有效的 id 时，应保留并使用原有的 id", () => {
		const result = createMockResult([
			{ id: "Custom1", startTime: 0, endTime: 1000, text: "Line 1" },
			{ id: "Custom2", startTime: 1000, endTime: 2000, text: "Line 2" },
		]);

		const xml = generator.generate(result);

		expect(xml).toContain('itunes:key="Custom1"');
		expect(xml).toContain('itunes:key="Custom2"');
		expect(xml).not.toContain('itunes:key="L1"');
	});
});

describe("TTML Generator - Agent 自动生成与补全逻辑测试", () => {
	let generator: TTMLGenerator;

	beforeAll(() => {
		generator = new TTMLGenerator({
			domImplementation: new DOMImplementation(),
			xmlSerializer: new XMLSerializer(),
		});
	});

	test("当未提供 meta.agents 且歌词行未提供 agentId 时，应默认推断并生成 v1", () => {
		const result: TTMLResult = {
			metadata: {},
			lines: [
				{ startTime: 0, endTime: 1000, text: "Line 1" },
				{ startTime: 1000, endTime: 2000, text: "Line 2" },
			],
		};

		const xml = generator.generate(result);

		expect(xml).toContain('<ttm:agent type="person" xml:id="v1"');
		const pTagMatches = xml.match(/ttm:agent="v1"/g);
		expect(pTagMatches?.length).toBe(2);
	});

	test("当未提供 meta.agents 但歌词行提供了不同的 agentId 时，应自动提取所有出现的 agentId 并去重", () => {
		const result: TTMLResult = {
			metadata: {},
			lines: [
				{ agentId: "v1", startTime: 0, endTime: 1000, text: "Line 1" },
				{ agentId: "v2", startTime: 1000, endTime: 2000, text: "Line 2" },
				{ agentId: "v1", startTime: 2000, endTime: 3000, text: "Line 3" },
			],
		};

		const xml = generator.generate(result);

		const v1AgentDeclMatches = xml.match(
			/<ttm:agent type="person" xml:id="v1"/g,
		);
		const v2AgentDeclMatches = xml.match(
			/<ttm:agent type="person" xml:id="v2"/g,
		);

		expect(v1AgentDeclMatches?.length).toBe(1);
		expect(v2AgentDeclMatches?.length).toBe(1);
	});

	test("当提供了 meta.agents 时，应以提供的 agents 为准，不进行自动推断", () => {
		const result: TTMLResult = {
			metadata: {
				agents: {
					v3: { id: "v3", name: "Custom Singer", type: "person" },
				},
			},
			lines: [
				{ agentId: "v1", startTime: 0, endTime: 1000, text: "Line 1" },
				{ agentId: "v2", startTime: 1000, endTime: 2000, text: "Line 2" },
			],
		};

		const xml = generator.generate(result);

		expect(xml).toContain('xml:id="v3"');
		expect(xml).toContain("Custom Singer");

		expect(xml).not.toContain('<ttm:agent type="person" xml:id="v1"');
		expect(xml).not.toContain('<ttm:agent type="person" xml:id="v2"');

		expect(xml).toContain(
			'<p begin="0.000" end="1.000" itunes:key="L1" ttm:agent="v1">',
		);
		expect(xml).toContain(
			'<p begin="1.000" end="2.000" itunes:key="L2" ttm:agent="v2">',
		);
	});

	test("当歌词行中有 ID 为 v1000 的演唱者时，推断生成的 agent 类型应为 group", () => {
		const result: TTMLResult = {
			metadata: {},
			lines: [
				{
					agentId: "v1",
					startTime: 0,
					endTime: 1000,
					text: "Line 1",
				},
				{
					agentId: "v1000",
					startTime: 1000,
					endTime: 2000,
					text: "Chorus Line",
				},
			],
		};

		const xml = generator.generate(result);

		expect(xml).toContain('<ttm:agent type="person" xml:id="v1"');
		expect(xml).toContain('<ttm:agent type="group" xml:id="v1000"');
		expect(xml).toContain(
			'<p begin="0.000" end="1.000" itunes:key="L1" ttm:agent="v1">',
		);
		expect(xml).toContain(
			'<p begin="1.000" end="2.000" itunes:key="L2" ttm:agent="v1000">',
		);
	});
});
