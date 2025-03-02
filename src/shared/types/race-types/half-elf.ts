
import IAbility from "@shared/types/ability-types/ability";
import Hide from "@shared/types/ability-types/skills/Hide";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Infravision from "@shared/types/ability-types/spells/Infravision";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class HalfElf implements IRace {
    private static instance: HalfElf;
    
    public id: string;
    public imageUrl: string;
    public description?: string | undefined;
    public cpModifier?: number | undefined;
    public name: string;
    public displayName: string;
    public isLimitedRace: boolean;
    public isMortalRace: boolean;
    public isLargeRace: boolean;
    public stats: IStatAttribute[];
    public primaryAttributeModifier: IStatAttribute;
    public secondaryAttributeModifier: IStatAttribute;
    public immunities: IDamageType[];
    public resistances: IDamageType[];
    public vulnerabilities: IDamageType[];
    public racialAbilities: IAbility[];
    public availableClasses: IDslClass[];
    public restrictedClasses: IDslClass[];
    public boostedClasses: Map<IDslClass, BoostedClass[]>;

    constructor() {
        this.id = "6";
        this.name = "halfelf";
        this.displayName = "Half Elf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 50
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 69
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 69
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 63
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 49
            })
        ]
        this.primaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 8
        });
        this.secondaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 4
        });
        this.immunities = [
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Hide.GetInstance().Get(),
            Sneak.GetInstance().Get(),
            Infravision.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Swashbuckler(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Nightshade(),
            new Ninja(),
            new Mage(),
            new Illusionist(),
            new Witch(),
            new Warlock(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage(),
            new Bladesinger(),
            new Eldritch()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Swashbuckler(), 10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), 20, null, null),
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), 10, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mentalist(), 10, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
            new IClassBoost(new Crusader(), 10, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), 10, null, null),
            new IClassBoost(new Jongleur(), 10, null, null),
            new IClassBoost(new Charlatan(), 10, null, null),
            new IClassBoost(new Skald(), 10, null, null),
            new IClassBoost(new Brewmaster(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/HalfElf.png`
        this.description = `Half Elf, half human, these people are looked down upon by other elves. 
The Shalonesti Elves allow these elves to be raised with them, but don't
consider them equals. Half elves look like other elves except for the
slightly larger build and the ability of the males to grow facial hair.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): HalfElf {
        if (!HalfElf.instance) {
            HalfElf.instance = new HalfElf();
        }
        return HalfElf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HalfElf.GetInstance() as T;
    }
}

export default HalfElf;