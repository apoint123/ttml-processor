/** biome-ignore-all lint/style/noNonNullAssertion: 为了测试 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { TTMLGenerator } from "@/generator";
import { TTMLParser } from "@/parser";
import type { TTMLResult } from "@/types";

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
		const amllMetadata = [
			{ key: "musicName", value: ["Test Song"] },
			{ key: "artists", value: ["Artist A", "Artist B"] },
		];

		const amllLines = [
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

		const ttmlResult = TTMLGenerator.toTTMLResult(amllLines, amllMetadata, {
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
