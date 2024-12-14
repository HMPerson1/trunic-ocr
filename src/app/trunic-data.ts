export const VOWEL_LUT: ReadonlyArray<number> = [-128, 13, 12, 5, -1, -1, 1, 0, 14, -1, -1, -1, 4, -1, -1, 7, 15, -1, -1, -1, 17, -1, 11, 9, 2, -1, -1, 10, 3, 8, 6, 16];
export const CNSNT_LUT: ReadonlyArray<number> = [-128, -1, -1, -1, -1, 22, -1, -1, -1, -1, 9, -1, -1, -1, -1, -1, -1, 3, 23, 20, 10, 5, 21, 13, -1, 11, -1, 15, -1, -1, -1, -1, -1, -1, 4, 7, -1, -1, 12, -1, 0, -1, 6, -1, 1, -1, -1, 18, -1, 8, 19, -1, -1, -1, 16, -1, -1, -1, 14, -1, -1, 17, -1, 2];

type VowelTab<T> = ReadonlyArray<ReadonlyArray<T>> & { length: 18 };
const VOWELS_MW: VowelTab<string> = [["a"], ["ȯ", "ä"], ["i"], ["e"], ["u̇"], ["ə"], ["ē"], ["ü"], ["ər"], ["ȯr"], ["är"], ["ir"], ["ā"], ["ī"], ["ȯi"], ["au̇"], ["ō"], ["er"]];
const VOWELS_OED: VowelTab<string> = [["æ"], ["ɑ", "ɔ"], ["ɪ"], ["ɛ"], ["ʊ"], ["ə"], ["i"], ["u"], ["ər"], ["ɔr"], ["ɑr"], ["ɪr"], ["eɪ"], ["aɪ"], ["ɔɪ"], ["aʊ"], ["oʊ"], ["ɛr"]];
const VOWELS_WP: VowelTab<string> = [["æ"], ["ɒ", "ɑː", "ɔː"], ["ɪ"], ["ɛ"], ["ʊ"], ["ə"], ["iː"], ["uː"], ["ʌr, ɜːr"], ["ɒr, ɔːr"], ["ɑːr"], ["ɪər"], ["eɪ"], ["aɪ"], ["ɔɪ"], ["aʊ"], ["oʊ"], ["ɛər"]];
export const VOWELS_EXAMPLES: VowelTab<[string] | [string, string]> = [
    [["mat"], ["trap"], ["bath"], ["mad"], ["fan"], ["sang", "sing"]],
    [["saw"], ["lot"], ["palm"], ["cloth"], ["thought"], ["cot"], ["caught"]],
    [["tip"], ["kit"], ["hill", "heel"], ["pin", "pen"], ["sing", "sang"]],
    [["bet"], ["dress"], ["pen", "pin"]],
    [["wood"], ["foot"], ["pull", "pool"]],
    [["humdrum"], ["strut"], ["gull", "goal"]],
    [["beat"], ["fleece"], ["heel", "hill"]],
    [["youth"], ["goose"], ["news"], ["pool", "pull"]],
    [["further"], ["nurse"], ["hurry"], ["furry"]],
    [["boar"], ["north"], ["force"], ["horse"], ["hoarse"]],
    [["car"], ["start"]],
    [["near"], ["deer"]],
    [["day"], ["face"]],
    [["site"], ["pride"], ["side"], ["shy"]],
    [["coin"], ["choice"]],
    [["loud"], ["mouth"], ["out"]],
    [["bone"], ["goat"], ["goal", "gull"]],
    [["bare"], ["square"], ["Mary"], ["marry"], ["merry"]],
];

type ConsonantTab<T> = ReadonlyArray<ReadonlyArray<T>> & { length: 24 };
const CONSONANTS_MW: ConsonantTab<string> = [["m"], ["n"], ["ŋ"], ["p"], ["b"], ["t"], ["d"], ["k"], ["g"], ["j"], ["ch"], ["f"], ["v"], ["th"], ["t͟h"], ["s"], ["z"], ["sh"], ["zh"], ["h"], ["r"], ["y"], ["w", "hw"], ["l"]];
const CONSONANTS_OED: ConsonantTab<string> = [["m"], ["n"], ["ŋ"], ["p"], ["b"], ["t"], ["d"], ["k"], ["g"], ["dʒ"], ["tʃ"], ["f"], ["v"], ["θ"], ["ð"], ["s"], ["z"], ["ʃ"], ["ʒ"], ["h"], ["r"], ["j"], ["w", "hw"], ["l"]];
const CONSONANTS_WP = CONSONANTS_OED;
export const CONSONANTS_EXAMPLES: ConsonantTab<[string] | [string, string]> = [
    [["murmur"]],
    [["no"]],
    [["sing"]],
    [["pepper"]],
    [["baby"]],
    [["tie"], ["latter", "ladder"]],
    [["did"], ["ladder", "latter"]],
    [["kin"]],
    [["go"]],
    [["job"]],
    [["chin"]],
    [["fifty"]],
    [["vivid"]],
    [["thin"]],
    [["then"]],
    [["source"]],
    [["zone"]],
    [["shy"]],
    [["vision"]],
    [["hat"]],
    [["red"]],
    [["yard"]],
    [["we"], ["whale"]],
    [["lily"]],
];

export type PronunciationSystem = {
    name: string,
    vowels: VowelTab<string>,
    consonants: ConsonantTab<string>,
}
export const PRONUNCIATION_SYSTEMS: ReadonlyArray<PronunciationSystem> = [
    { name: "Merriam Webster", vowels: VOWELS_MW, consonants: CONSONANTS_MW },
    { name: "Oxford English Dictionary", vowels: VOWELS_OED, consonants: CONSONANTS_OED },
    { name: "Wikipedia", vowels: VOWELS_WP, consonants: CONSONANTS_WP },
];
