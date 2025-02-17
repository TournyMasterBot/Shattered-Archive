export interface IClassType {
    id: string;
    name: string;
}

export interface IMortalClass extends IClassType {
    
}

export interface IRemort extends IClassType {

}

export class MortalClass implements IMortalClass {
    id: string;
    name: string;
    displayName: string;

    constructor(id: string, name: string, displayName: string) {
        this.id = id;
        this.name = name;
        this.displayName = displayName;
    }

    static Unknown = new MortalClass("0", "unknown", "");
    static Armsman = new MortalClass("10", "armsman", "Armsman");
    static Assassin = new MortalClass("20", "assassin", "Assassin");
    static Bandit = new MortalClass("30", "bandit", "Bandit");
    static Barbarian = new MortalClass("40", "barbarian", "Barbarian");
    static Bard = new MortalClass("50", "bard", "Bard");
    static Battlemage = new MortalClass("60", "battlemage", "Battlemage");
    static Battlerager = new MortalClass("70", "battlerager", "Battlerager");
    static Bladesinger = new MortalClass("80", "bladesinger", "Bladesinger");
    static Brewmaster = new MortalClass("90", "brewmaster", "Brewmaster");
    static Charlatan = new MortalClass("100", "charlatan", "Charlatan");
    static Cleric = new MortalClass("110", "cleric", "Cleric");
    static Crusader = new MortalClass("120", "crusader", "Crusader");
    static Druid = new MortalClass("130", "druid", "Druid");
    static Enchantor = new MortalClass("140", "enchantor", "Enchantor");
    static Illusionist = new MortalClass("150", "illusionist", "Illusionist");
    static Invoker = new MortalClass("160", "invoker", "Invoker");
    static Jongleur = new MortalClass("170", "jongleur", "Jongleur");
    static Mage = new MortalClass("180", "mage", "Mage");
    static Necromancer = new MortalClass("190", "necromancer", "Necromancer");
    static Nightshade = new MortalClass("200", "nightshade", "Nightshade");
    static Ninja = new MortalClass("210", "ninja", "Ninja");
    static Paladin = new MortalClass("220", "paladin", "Paladin");
    static Pirate = new MortalClass("230", "pirate", "Pirate");
    static Priest = new MortalClass("240", "priest", "Priest");
    static Ranger = new MortalClass("250", "ranger", "Ranger");
    static Samurai = new MortalClass("260", "samurai", "Samurai");
    static Shaman = new MortalClass("270", "shaman", "Shaman");
    static Shukenja = new MortalClass("280", "shukenja", "Shukenja");
    static Skald = new MortalClass("290", "skald", "Skald");
    static Swashbuckler = new MortalClass("300", "swashbuckler", "Swashbuckler");
    static Thief = new MortalClass("310", "thief", "Thief");
    static Transmuter = new MortalClass("320", "transmuter", "Transmuter");
    static Warlock = new MortalClass("330", "warlock", "Warlock");
    static Warrior = new MortalClass("340", "warrior", "Warrior");
    static Witch = new MortalClass("350", "witch", "Witch");
    static WuJen = new MortalClass("360", "wuJen", "Wu Jen");
    static Mentalist = new MortalClass("370", "mentalist", "Mentalist");
    static Dragonslayer = new MortalClass("380", "dragonslayer", "Dragonslayer");
    static ShadowKnight = new MortalClass("390", "shadowKnight", "Shadowknight");
    static ShadowMage = new MortalClass("400", "shadowMage", "Shadowmage");
    static Eldritch = new MortalClass("410", "eldritch", "Eldritch");
    static Confessor = new MortalClass("420", "confessor", "Confessor");
    static Monk = new MortalClass("430", "monk", "Monk");
    static Runesmith = new MortalClass("440", "runesmith", "Runesmith");

    static values(): MortalClass[] {
        return [
            MortalClass.Unknown,
            MortalClass.Armsman,
            MortalClass.Assassin,
            MortalClass.Bandit,
            MortalClass.Barbarian,
            MortalClass.Bard,
            MortalClass.Battlemage,
            MortalClass.Battlerager,
            MortalClass.Bladesinger,
            MortalClass.Brewmaster,
            MortalClass.Charlatan,
            MortalClass.Cleric,
            MortalClass.Crusader,
            MortalClass.Druid,
            MortalClass.Enchantor,
            MortalClass.Illusionist,
            MortalClass.Invoker,
            MortalClass.Jongleur,
            MortalClass.Mage,
            MortalClass.Necromancer,
            MortalClass.Nightshade,
            MortalClass.Ninja,
            MortalClass.Paladin,
            MortalClass.Pirate,
            MortalClass.Priest,
            MortalClass.Ranger,
            MortalClass.Samurai,
            MortalClass.Shaman,
            MortalClass.Shukenja,
            MortalClass.Skald,
            MortalClass.Swashbuckler,
            MortalClass.Thief,
            MortalClass.Transmuter,
            MortalClass.Warlock,
            MortalClass.Warrior,
            MortalClass.Witch,
            MortalClass.WuJen,
            MortalClass.Mentalist,
            MortalClass.Dragonslayer,
            MortalClass.ShadowKnight,
            MortalClass.ShadowMage,
            MortalClass.Eldritch,
            MortalClass.Confessor,
            MortalClass.Monk,
            MortalClass.Runesmith,
        ];
    }
}
/**
// Usage example
 const mortalClasses = MortalClass.values();
console.log(mortalClasses.map(mc => `${mc.name}: ${mc.description}`));
 */