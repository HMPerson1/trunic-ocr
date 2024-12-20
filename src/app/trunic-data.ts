export const VOWEL_LUT: ReadonlyArray<number> = [-128, 13, 12, 5, -1, -1, 1, 0, 14, -1, -1, -1, 4, -1, -1, 7, 15, -1, -1, -1, 17, -1, 11, 9, 2, -1, -1, 10, 3, 8, 6, 16];
export const CNSNT_LUT: ReadonlyArray<number> = [-128, -1, -1, -1, -1, 22, -1, -1, -1, -1, 9, -1, -1, -1, -1, -1, -1, 3, 23, 20, 10, 5, 21, 13, -1, 11, -1, 15, -1, -1, -1, -1, -1, -1, 4, 7, -1, -1, 12, -1, 0, -1, 6, -1, 1, -1, -1, 18, -1, 8, 19, -1, -1, -1, 16, -1, -1, -1, 14, -1, -1, 17, -1, 2];

type VowelTab<T> = ReadonlyArray<ReadonlyArray<T>> & { length: 18 };
const VOWELS_MW: VowelTab<string> = [["a"], ["ȯ", "ä"], ["i"], ["e"], ["u̇"], ["ə"], ["ē"], ["ü"], ["ər"], ["ȯr"], ["är"], ["ir"], ["ā"], ["ī"], ["ȯi"], ["au̇"], ["ō"], ["er"]];
const VOWELS_OED: VowelTab<string> = [["æ"], ["ɑ", "ɔ"], ["ɪ"], ["ɛ"], ["ʊ"], ["ə"], ["i"], ["u"], ["ər"], ["ɔr"], ["ɑr"], ["ɪr"], ["eɪ"], ["aɪ"], ["ɔɪ"], ["aʊ"], ["oʊ"], ["ɛr"]];
const VOWELS_WP: VowelTab<string> = [["æ"], ["ɒ", "ɑː", "ɔː"], ["ɪ"], ["ɛ"], ["ʊ"], ["ʌ", "ə"], ["iː"], ["uː"], ["ʌr", "ɜːr", "ər"], ["ɒr", "ɔːr"], ["ɑːr"], ["ɪr", "ɪər"], ["eɪ"], ["aɪ"], ["ɔɪ"], ["aʊ"], ["oʊ"], ["ɛr", "ær", "ɛər"]];
export const VOWELS_EXAMPLES: VowelTab<[MarkedWord] | [MarkedWord, MarkedWord]> = [
    [[["m", "a", "t"]], [["tr", "a", "p"]], [["b", "a", "th"]], [["m", "a", "d"]], [["f", "a", "n"]], [["s", "a", "ng"], ["s", "i", "ng"]]],
    [[["s", "a", "w"]], [["l", "o", "t"]], [["p", "a", "lm"]], [["cl", "o", "th"]], [["th", "ough", "t"]], [["c", "o", "t"]], [["c", "augh", "t"]]],
    [[["t", "i", "p"]], [["k", "i", "t"]], [["h", "i", "ll"], ["h", "ee", "l"]], [["p", "i", "n"], ["p", "e", "n"]], [["s", "i", "ng"], ["s", "a", "ng"]]],
    [[["b", "e", "t"]], [["dr", "e", "ss"]], [["p", "e", "n"], ["p", "i", "n"]]],
    [[["w", "oo", "d"]], [["f", "oo", "t"]], [["p", "u", "ll"], ["p", "oo", "l"]]],
    [[["h", "u", "mdr", "u", "m"]], [["str", "u", "t"]], [["g", "u", "ll"], ["g", "oa", "l"]]],
    [[["b", "ea", "t"]], [["fl", "ee", "ce"]], [["h", "ee", "l"], ["h", "i", "ll"]]],
    [[["y", "ou", "th"]], [["g", "oo", "se"]], [["n", "e", "ws"]], [["p", "oo", "l"], ["p", "u", "ll"]]],
    [[["f", "ur", "th", "er"]], [["n", "ur", "se"]], [["h", "urr", "y"]], [["f", "urr", "y"]]],
    [[["b", "oar"]], [["n", "or", "th"]], [["f", "or", "ce"]], [["h", "or", "se"]], [["h", "oar", "se"]]],
    [[["c", "ar"]], [["st", "ar", "t"]]],
    [[["n", "ear"]], [["d", "eer"]]],
    [[["d", "ay"]], [["f", "a", "ce"]]],
    [[["s", "i", "te"]], [["pr", "i", "de"]], [["s", "i", "de"]], [["sh", "y"]]],
    [[["c", "oi", "n"]], [["ch", "oi", "ce"]]],
    [[["l", "ou", "d"]], [["m", "ou", "th"]], [["", "ou", "t"]]],
    [[["b", "o", "ne"]], [["g", "oa", "t"]], [["g", "oa", "l"], ["g", "u", "ll"]]],
    [[["b", "are"]], [["squ", "are"]], [["M", "ar", "y"]], [["m", "arr", "y"]], [["m", "err", "y"]]],
];

type ConsonantTab<T> = ReadonlyArray<ReadonlyArray<T>> & { length: 24 };
const CONSONANTS_MW: ConsonantTab<string> = [["m"], ["n"], ["ŋ"], ["p"], ["b"], ["t"], ["d"], ["k"], ["g"], ["j"], ["ch"], ["f"], ["v"], ["th"], ["t͟h"], ["s"], ["z"], ["sh"], ["zh"], ["h"], ["r"], ["y"], ["w", "hw"], ["l"]];
const CONSONANTS_OED: ConsonantTab<string> = [["m"], ["n"], ["ŋ"], ["p"], ["b"], ["t"], ["d"], ["k"], ["g"], ["dʒ"], ["tʃ"], ["f"], ["v"], ["θ"], ["ð"], ["s"], ["z"], ["ʃ"], ["ʒ"], ["h"], ["r"], ["j"], ["w", "hw"], ["l"]];
const CONSONANTS_WP = CONSONANTS_OED;
export const CONSONANTS_EXAMPLES: ConsonantTab<[MarkedWord] | [MarkedWord, MarkedWord]> = [
    [[["", "m", "ur", "m", "ur"]]],
    [[["", "n", "o"]]],
    [[["si", "ng"]]],
    [[["", "p", "e", "pp", "er"]]],
    [[["", "b", "a", "b", "y"]]],
    [[["", "t", "ie"]], [["la", "tt", "er"], ["la", "dd", "er"]]],
    [[["", "d", "i", "d"]], [["la", "dd", "er"], ["la", "tt", "er"]]],
    [[["", "k", "in"]]],
    [[["", "g", "o"]]],
    [[["", "j", "ob"]]],
    [[["", "ch", "in"]]],
    [[["", "f", "i", "f", "ty"]]],
    [[["", "v", "i", "v", "id"]]],
    [[["", "th", "in"]]],
    [[["", "th", "en"]]],
    [[["", "s", "our", "ce"]]],
    [[["", "z", "one"]]],
    [[["", "sh", "y"]]],
    [[["vi", "si", "on"]]],
    [[["", "h", "at"]]],
    [[["", "r", "ed"]]],
    [[["", "y", "ard"]]],
    [[["", "w", "e"]], [["", "wh", "ale"]]],
    [[["", "l", "i", "l", "y"]]],
];

export type PronunciationSystem = {
    name: string,
    delimiter: string,
    vowels: VowelTab<string>,
    consonants: ConsonantTab<string>,
}
export const PRONUNCIATION_SYSTEMS: ReadonlyArray<PronunciationSystem> = [
    { name: "Merriam Webster", delimiter: "\\", vowels: VOWELS_MW, consonants: CONSONANTS_MW },
    { name: "Oxford English Dictionary", delimiter: "/", vowels: VOWELS_OED, consonants: CONSONANTS_OED },
    { name: "Wikipedia", delimiter: "/", vowels: VOWELS_WP, consonants: CONSONANTS_WP },
];

type MarkedWord = ReadonlyArray<string>
