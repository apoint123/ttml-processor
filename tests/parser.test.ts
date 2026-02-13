/** biome-ignore-all lint/style/noNonNullAssertion: 为了测试 */
import { beforeAll, describe, expect, test } from "bun:test";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { TTMLGenerator } from "@/generator";
import { TTMLParser } from "@/parser";
import type { AmllLyricLine, TTMLResult } from "@/types";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"
    xmlns:amll="http://www.example.com/ns/amll"
    xml:lang="ja"
    itunes:timing="Word">

    <head>
        <metadata>
            <ttm:title>Complex Test Song</ttm:title>

            <ttm:agent type="person" xml:id="v1">
                <ttm:name type="full">Vocalist A (Taro)</ttm:name>
            </ttm:agent>
            <ttm:agent type="person" xml:id="v2">
                <ttm:name type="full">Vocalist B (Hanako)</ttm:name>
            </ttm:agent>
            <ttm:agent type="group" xml:id="v1000">
                <ttm:name type="full">Chorus Group</ttm:name>
            </ttm:agent>

            <amll:meta key="musicName" value="複雑なテストソング" />
            <amll:meta key="artists" value="Vocalist A (Taro)" />
            <amll:meta key="artists" value="Vocalist B (Hanako)" />
            <amll:meta key="album" value="AMLL Parser Test Suite" />
            <amll:meta key="isrc" value="JPXX02500001" />

            <amll:meta key="ncmMusicId" value="123456789" />
            <amll:meta key="qqMusicId" value="987654321" />
            <amll:meta key="spotifyId" value="abc123xyz" />
            <amll:meta key="appleMusicId" value="999888777" />

            <amll:meta key="ttmlAuthorGithub" value="10001" />
            <amll:meta key="ttmlAuthorGithubLogin" value="TestUser" />

            <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">
                <songwriters>
                    <songwriter>作曲者1号</songwriter>
                    <songwriter>作曲者2号</songwriter>
                </songwriters>
                <translations>
                    <translation type="subtitle" xml:lang="en-US">
                        <text for="L1">This is the first line (Vocalist A)</text>
                        <text for="L2">This is the second line (Vocalist B)</text>
                        <text for="L3"> This is the chorus line <span ttm:role="x-bg">(With
                            background)</span>
                        </text>
                    </translation>
                    <translation type="subtitle" xml:lang="zh-Hans-CN">
                        <text for="L1">这是第一行歌词 (演唱者A)</text>
                        <text for="L2">这是第二行歌词 (演唱者B)</text>
                        <text for="L3"> 这是合唱部分 <span ttm:role="x-bg">(带背景音)</span>
                        </text>
                    </translation>
                </translations>

                <transliterations>
                    <transliteration xml:lang="ja-Latn">
                        <text for="L1">
                            <span begin="00:10.000" end="00:10.500">Ko</span>
                            <span begin="00:10.500" end="00:10.800">re </span>
                            <span begin="00:10.800" end="00:11.000">wa </span>
                            <span begin="00:11.200" end="00:11.800">tesuto</span>
                        </text>
                        <text for="L2">
                            <span begin="00:15.000" end="00:15.800">Futatsume </span>
                            <span begin="00:16.000" end="00:16.500">no </span>
                            <span begin="00:16.500" end="00:17.000">rain</span>
                        </text>
                        <text for="L3">
                            <span begin="00:20.000" end="00:21.500">Kōrasu </span>
                            <span begin="00:21.500" end="00:22.000">desu</span>
                            <span ttm:role="x-bg">
                                <span begin="00:22.500" end="00:23.800">(haikei)</span>
                            </span>
                        </text>
                    </transliteration>
                </transliterations>
            </iTunesMetadata>
        </metadata>
    </head>

    <body dur="00:30.000">
        <div begin="00:08.000" end="00:18.000" itunes:song-part="Verse">
            <p begin="00:10.000" end="00:12.000" itunes:key="L1" ttm:agent="v1">
                <span begin="00:10.000" end="00:10.500">これ</span>
                <span begin="00:10.500" end="00:10.800">は </span>
                <span begin="00:11.200" end="00:11.800">テスト</span>
            </p>

            <p begin="00:15.000" end="00:17.000" itunes:key="L2" ttm:agent="v2">
                <span begin="00:15.000" end="00:15.800">二つ目 </span>
                <span begin="00:16.000" end="00:16.500">の </span>
                <span begin="00:16.500" end="00:17.000">ライン</span>
            </p>
        </div>

        <div begin="00:19.000" end="00:30.000" itunes:song-part="Chorus">
            <p begin="00:20.000" end="00:25.000" itunes:key="L3" ttm:agent="v1000">
                <span begin="00:20.000" end="00:21.500">コーラス </span>
                <span begin="00:21.500" end="00:22.000">です</span>

                <span ttm:role="x-bg" begin="00:22.500" end="00:23.800" ttm:agent="v1">
                    <span begin="00:22.500" end="00:23.800">(背景)</span>
                    <span ttm:role="x-translation" xml:lang="en">Background</span>
                    <span ttm:role="x-roman" xml:lang="ja-Latn">haikei</span>
                </span>
            </p>
        </div>
    </body>
</tt>`;

describe("TTML Integration Test", () => {
	let parser: TTMLParser;
	let result: TTMLResult;

	beforeAll(() => {
		parser = new TTMLParser({ domParser: new DOMParser() });
		result = parser.parse(XML);
	});

	test("Metadata: 应当解析全局语言和时间模式", () => {
		expect(result.metadata.language).toBe("ja");
		expect(result.metadata.timingMode).toBe("Word");
		expect(result.metadata.title).toHaveLength(2);
		expect(result.metadata.title).toEqual([
			"Complex Test Song",
			"複雑なテストソング",
		]);
	});

	test("Metadata: 应当解析平台 IDs", () => {
		expect(result.metadata.platformIds?.ncmMusicId).toContain("123456789");
		expect(result.metadata.platformIds?.qqMusicId).toContain("987654321");
		expect(result.metadata.platformIds?.spotifyId).toContain("abc123xyz");
		expect(result.metadata.platformIds?.appleMusicId).toContain("999888777");
	});

	test("Metadata: 应当解析 Artists 列表", () => {
		expect(result.metadata.artist).toHaveLength(2);
		expect(result.metadata.artist).toContain("Vocalist A (Taro)");
		expect(result.metadata.artist).toContain("Vocalist B (Hanako)");
	});

	test("Metadata: 应当建立 Agent 映射表", () => {
		expect(result.metadata.agents.v1?.name).toBe("Vocalist A (Taro)");
		expect(result.metadata.agents.v1000?.name).toBe("Chorus Group");
	});

	test("应当能正确解析 Songwriters 列表", () => {
		expect(result.metadata.songwriters).toBeArray();
		expect(result.metadata.songwriters).toHaveLength(2);
		expect(result.metadata.songwriters).toContain("作曲者1号");
		expect(result.metadata.songwriters).toContain("作曲者2号");
	});

	test("Metadata: 应当解析 ISRC", () => {
		expect(result.metadata.isrc).toBeArray();
		expect(result.metadata.isrc).toContain("JPXX02500001");
	});

	test("L1: 应当处理 Verse 和 Agent", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		expect(l1).toBeDefined();
		expect(l1.songPart).toBe("Verse");
		expect(l1.agentId).toBe("v1");
	});

	test("L1: 应当合并 Head 中的翻译", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		const transEn = l1.translations!.find((t) => t.language === "en-US")!;
		const transZh = l1.translations!.find((t) => t.language === "zh-Hans-CN")!;

		expect(transEn.text).toBe("This is the first line (Vocalist A)");
		expect(transZh.text).toBe("这是第一行歌词 (演唱者A)");
	});

	test("L1: 应当合并 Head 中的逐字音译", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		const roman = l1.romanizations!.find((r) => r.language === "ja-Latn")!;
		const romanWords = roman.words!;

		expect(roman).toBeDefined();
		expect(roman.words).toBeArray();
		expect(romanWords[0].text).toBe("Ko");
		expect(romanWords[0].endsWithSpace).toBeFalsy();

		expect(romanWords[1].text).toBe("re");
		expect(romanWords[1].endsWithSpace).toBeTrue();
	});

	test("L1: 应当处理显式的空格 Span", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;

		const words = l1.words!;
		expect(words[0].text).toBe("これ");

		expect(words[1].text).toBe("は");
		expect(words[1].endsWithSpace).toBeTrue();

		expect(words[2].text).toBe("テスト");
	});

	test("L3: 应当处理复杂的背景人声嵌套", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		expect(l3.songPart).toBe("Chorus");
		expect(l3.agentId).toBe("v1000");

		expect(l3.text).toContain("コーラス です");

		expect(l3.backgroundVocals).toBeDefined();
		expect(l3.backgroundVocals).toHaveLength(1);

		const bg = l3.backgroundVocals![0]!;
		expect(bg.text).toBe("背景");

		const transEn = bg.translations!.find((t) => t.language === "en")!;
		expect(transEn.text).toBe("Background");

		const roman = bg.romanizations!.find((r) => r.language === "ja-Latn")!;
		expect(roman.text).toBe("haikei");
	});

	test("L3: 应当同时保留 Body 内联翻译(en)和 Head 注入翻译(en-US)", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		const bg = l3.backgroundVocals![0]!;

		const transEn = bg.translations!.find((t) => t.language === "en");
		expect(transEn).toBeDefined();
		expect(transEn!.text).toBe("Background");

		const transEnUS = bg.translations!.find((t) => t.language === "en-US");
		expect(transEnUS).toBeDefined();
		expect(transEnUS!.text).toBe("With background");
	});

	test("Lines: 应当解析所有歌词行", () => {
		expect(result.lines).toBeArray();
		expect(result.lines).toHaveLength(3);

		const lineIds = result.lines.map((l) => l.id);
		expect(lineIds).toContain("L1");
		expect(lineIds).toContain("L2");
		expect(lineIds).toContain("L3");
	});

	test("L2: 应当正确解析第二行数据", () => {
		const l2 = result.lines.find((l) => l.id === "L2")!;

		expect(l2).toBeDefined();
		expect(l2.songPart).toBe("Verse");
		expect(l2.agentId).toBe("v2");
		expect(l2.text).toContain("二つ目");
		expect(l2.text).toContain("の");
		expect(l2.text).toContain("ライン");
	});

	test("L2: 应当解析逐字音节的时间", () => {
		const l2 = result.lines.find((l) => l.id === "L2")!;

		expect(l2.words).toBeDefined();
		expect(l2.words).toHaveLength(3);

		expect(l2.words![0].text).toBe("二つ目");
		expect(l2.words![0].startTime).toBe(15000);
		expect(l2.words![0].endTime).toBe(15800);
		expect(l2.words![0].endsWithSpace).toBeTrue();

		expect(l2.words![1].text).toBe("の");
		expect(l2.words![1].startTime).toBe(16000);
		expect(l2.words![1].endTime).toBe(16500);
		expect(l2.words![1].endsWithSpace).toBeTrue();

		expect(l2.words![2].text).toBe("ライン");
		expect(l2.words![2].startTime).toBe(16500);
		expect(l2.words![2].endTime).toBe(17000);
	});

	test("Timing: 应当验证所有行的时间范围", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		expect(l1.startTime).toBe(10000);
		expect(l1.endTime).toBe(12000);

		const l2 = result.lines.find((l) => l.id === "L2")!;
		expect(l2.startTime).toBe(15000);
		expect(l2.endTime).toBe(17000);

		const l3 = result.lines.find((l) => l.id === "L3")!;
		expect(l3.startTime).toBe(20000);
		expect(l3.endTime).toBe(25000);
	});

	test("L1: 应当验证逐字音节的时间准确性", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;

		expect(l1.words).toBeDefined();
		expect(l1.words).toHaveLength(3);

		expect(l1.words![0].startTime).toBe(10000);
		expect(l1.words![0].endTime).toBe(10500);

		expect(l1.words![1].startTime).toBe(10500);
		expect(l1.words![1].endTime).toBe(10800);

		expect(l1.words![2].startTime).toBe(11200);
		expect(l1.words![2].endTime).toBe(11800);
	});

	test("Metadata: 应当解析专辑信息", () => {
		expect(result.metadata.album).toBeArray();
		expect(result.metadata.album).toHaveLength(1);
		expect(result.metadata.album![0]).toBe("AMLL Parser Test Suite");
	});

	test("Metadata: 应当解析作者信息", () => {
		expect(result.metadata.authorIds).toBeArray();
		expect(result.metadata.authorIds).toHaveLength(1);
		expect(result.metadata.authorIds![0]).toBe("10001");

		expect(result.metadata.authorNames).toBeArray();
		expect(result.metadata.authorNames).toHaveLength(1);
		expect(result.metadata.authorNames![0]).toBe("TestUser");
	});

	test("L2: 应当合并翻译和音译", () => {
		const l2 = result.lines.find((l) => l.id === "L2")!;

		expect(l2.translations).toBeDefined();
		const transEn = l2.translations!.find((t) => t.language === "en-US")!;
		const transZh = l2.translations!.find((t) => t.language === "zh-Hans-CN")!;

		expect(transEn.text).toBe("This is the second line (Vocalist B)");
		expect(transZh.text).toBe("这是第二行歌词 (演唱者B)");

		const roman = l2.romanizations!.find((r) => r.language === "ja-Latn")!;
		expect(roman).toBeDefined();
		expect(roman.words).toBeArray();
		expect(roman.words).toHaveLength(3);
	});

	test("L2: 应当正确解析音译的逐字时间", () => {
		const l2 = result.lines.find((l) => l.id === "L2")!;
		const roman = l2.romanizations!.find((r) => r.language === "ja-Latn")!;

		expect(roman.words![0].text).toBe("Futatsume");
		expect(roman.words![0].startTime).toBe(15000);
		expect(roman.words![0].endTime).toBe(15800);
		expect(roman.words![0].endsWithSpace).toBeTrue();

		expect(roman.words![1].text).toBe("no");
		expect(roman.words![1].startTime).toBe(16000);
		expect(roman.words![1].endTime).toBe(16500);
		expect(roman.words![1].endsWithSpace).toBeTrue();

		expect(roman.words![2].text).toBe("rain");
		expect(roman.words![2].startTime).toBe(16500);
		expect(roman.words![2].endTime).toBe(17000);
	});

	test("L3: 应当正确解析主歌词的逐字时间", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;

		expect(l3.words).toBeDefined();
		expect(l3.words).toHaveLength(2);

		expect(l3.words![0].text).toBe("コーラス");
		expect(l3.words![0].startTime).toBe(20000);
		expect(l3.words![0].endTime).toBe(21500);
		expect(l3.words![0].endsWithSpace).toBeTrue();

		expect(l3.words![1].text).toBe("です");
		expect(l3.words![1].startTime).toBe(21500);
		expect(l3.words![1].endTime).toBe(22000);
	});

	test("L3: 应当解析背景人声的时间和逐字信息", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		const bg = l3.backgroundVocals![0]!;

		expect(bg.startTime).toBe(22500);
		expect(bg.endTime).toBe(23800);

		expect(bg.words).toBeDefined();
		expect(bg.words).toHaveLength(1);
		expect(bg.words![0].text).toBe("背景");
		expect(bg.words![0].startTime).toBe(22500);
		expect(bg.words![0].endTime).toBe(23800);
	});

	test("L3: 应当解析背景人声音译的逐字时间", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		const bg = l3.backgroundVocals![0]!;

		const roman = bg.romanizations!.find(
			(r) => r.language === "ja-Latn" && r.words && r.words.length > 0,
		)!;

		expect(roman).toBeDefined();
		expect(roman.words).toBeDefined();
		expect(roman.words).toHaveLength(1);

		expect(roman.words![0].text).toBe("haikei");
		expect(roman.words![0].startTime).toBe(22500);
		expect(roman.words![0].endTime).toBe(23800);
	});

	test("L3: 应当同时保留内嵌的逐行音译(Body)和Sidecar的逐字音译(Head)", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		const bg = l3.backgroundVocals![0]!;

		const jaRomans = bg.romanizations!.filter((r) => r.language === "ja-Latn");

		expect(jaRomans.length).toBeGreaterThanOrEqual(2);

		const inlineRoman = jaRomans.find((r) => !r.words || r.words.length === 0);
		expect(inlineRoman).toBeDefined();
		expect(inlineRoman!.text).toBe("haikei");

		const sidecarRoman = jaRomans.find((r) => r.words && r.words.length > 0);
		expect(sidecarRoman).toBeDefined();
		expect(sidecarRoman!.words).toHaveLength(1);
		expect(sidecarRoman!.words![0].text).toBe("haikei");
		expect(sidecarRoman!.words![0].startTime).toBe(22500);
		expect(sidecarRoman!.words![0].endTime).toBe(23800);
	});

	test("L3: 应当解析翻译中的背景角色标记", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;

		expect(l3.translations).toBeDefined();
		const transEn = l3.translations!.find((t) => t.language === "en-US")!;
		expect(transEn.text).toContain("This is the chorus line");

		const transZh = l3.translations!.find((t) => t.language === "zh-Hans-CN")!;
		expect(transZh.text).toContain("这是合唱部分");
	});

	test("L3: 翻译对象本身应当包含结构化的背景人声数据", () => {
		const l3 = result.lines.find((l) => l.id === "L3")!;
		const translation = l3.translations!.find((t) => t.language === "en-US")!;

		expect(translation.backgroundVocals).toBeArray();
		expect(translation.backgroundVocals).toHaveLength(1);
		expect(translation.backgroundVocals![0].text).toBe("With background");
	});

	test("Text: 应当正确拼接完整文本", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		expect(l1.text).toBe("これは テスト");

		const l2 = result.lines.find((l) => l.id === "L2")!;
		expect(l2.text).toBe("二つ目 の ライン");

		const l3 = result.lines.find((l) => l.id === "L3")!;
		expect(l3.text).toBe("コーラス です");
	});

	test("Agents: 应当正确映射所有演唱者", () => {
		expect(result.metadata.agents).toBeDefined();
		expect(Object.keys(result.metadata.agents)).toHaveLength(3);

		expect(result.metadata.agents.v1?.name).toBe("Vocalist A (Taro)");
		expect(result.metadata.agents.v2?.name).toBe("Vocalist B (Hanako)");
		expect(result.metadata.agents.v1000?.name).toBe("Chorus Group");
	});

	test("Romanization: 应当解析音译的合并文本", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		const roman = l1.romanizations!.find((r) => r.language === "ja-Latn")!;

		expect(roman.text).toBe("Kore wa tesuto");
	});

	test("Translation: 应当解析翻译的合并文本", () => {
		const l1 = result.lines.find((l) => l.id === "L1")!;
		const transEn = l1.translations!.find((t) => t.language === "en-US")!;
		const transZh = l1.translations!.find((t) => t.language === "zh-Hans-CN")!;

		expect(transEn.text).toBe("This is the first line (Vocalist A)");
		expect(transZh.text).toBe("这是第一行歌词 (演唱者A)");
	});

	test("Edge Cases: 应当验证所有时间都是有效数字", () => {
		for (const line of result.lines) {
			expect(typeof line.startTime).toBe("number");
			expect(typeof line.endTime).toBe("number");
			expect(line.startTime).toBeGreaterThanOrEqual(0);
			expect(line.endTime).toBeGreaterThan(line.startTime);

			if (line.words) {
				for (const word of line.words) {
					expect(typeof word.startTime).toBe("number");
					expect(typeof word.endTime).toBe("number");
					expect(word.startTime).toBeGreaterThanOrEqual(0);
					expect(word.endTime).toBeGreaterThanOrEqual(word.startTime);
				}
			}

			if (line.backgroundVocals) {
				for (const bg of line.backgroundVocals) {
					expect(typeof bg.startTime).toBe("number");
					expect(typeof bg.endTime).toBe("number");
					expect(bg.startTime).toBeGreaterThanOrEqual(0);
					expect(bg.endTime).toBeGreaterThan(bg.startTime);
				}
			}
		}
	});

	test("Edge Cases: 应当验证所有文本字段都是有效字符串", () => {
		for (const line of result.lines) {
			expect(typeof line.text).toBe("string");
			expect(line.text.length).toBeGreaterThan(0);
			expect(typeof line.id).toBe("string");
			expect(line.id.length).toBeGreaterThan(0);

			if (line.words) {
				for (const word of line.words) {
					expect(typeof word.text).toBe("string");
					expect(word.text.length).toBeGreaterThan(0);
				}
			}
		}
	});

	test("Round Trip: Parse -> Generate -> Parse 应当保持数据结构完全一致", () => {
		const originalResult = parser.parse(XML);

		const generator = new TTMLGenerator({
			domImplementation: new DOMImplementation(),
			xmlSerializer: new XMLSerializer(),
			useSidecar: false,
		});
		const generatedXML = generator.generate(originalResult);

		const roundTripParser = new TTMLParser({ domParser: new DOMParser() });
		const roundTripResult = roundTripParser.parse(generatedXML);

		expect(roundTripResult).toEqual(originalResult);
	});
});

describe("toAmllLyrics Conversion", () => {
	let parser: TTMLParser;
	let result: TTMLResult;
	let amllLines: AmllLyricLine[];

	beforeAll(() => {
		parser = new TTMLParser({ domParser: new DOMParser() });
		result = parser.parse(XML);
		amllLines = TTMLParser.toAmllLyrics(result);
	});

	test("Structure: 应当转换为扁平化的数组结构", () => {
		expect(amllLines).toBeArray();
		expect(amllLines).toHaveLength(4);
	});

	test("Structure: 应当正确排序", () => {
		for (let i = 0; i < amllLines.length - 1; i++) {
			expect(amllLines[i].startTime).toBeLessThanOrEqual(
				amllLines[i + 1].startTime,
			);
		}
	});

	test("Main Lyrics: 应当正确处理 L1 的逐字对齐", () => {
		const l1 = amllLines[0];
		expect(l1.words).toHaveLength(3);
		expect(l1.words[0].romanWord).toBe("Ko");
		expect(l1.words[1].romanWord).toBe("re");
		expect(l1.words[2].romanWord).toBe("tesuto");
	});

	test("Main Lyrics: 应当处理 duets 标记", () => {
		expect(amllLines[0].isDuet).toBeFalse();
		expect(amllLines[1].isDuet).toBeTrue();
		expect(amllLines[2].isDuet).toBeTrue();
	});

	test("Background: 应当设置 isBG 标记", () => {
		const bgLine = amllLines[3];
		expect(bgLine.isBG).toBeTrue();
		expect(bgLine.translatedLyric).toBe("Background");
		expect(bgLine.romanLyric).toBe("haikei");
	});
});
