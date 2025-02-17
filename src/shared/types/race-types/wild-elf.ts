
import IAbility from "@shared/types/ability-types/ability";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Hide from "@shared/types/ability-types/skills/hide";
import Sneak from "@shared/types/ability-types/skills/sneak";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class WildElf implements IRace {
    private static instance: WildElf;
    
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
        this.id = "4";
        this.name = "wildelf";
        this.displayName = "Wild Elf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 10;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 49
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 64
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 56
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 78
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 52
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
            Sneak.GetInstance().Get(),
            Hide.GetInstance().Get(),
            FastHealing.GetInstance().Get()
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
            new IClassBoost(new Warrior(), 15, null, null),
            new IClassBoost(new Barbarian(), 20, null, null),
            new IClassBoost(new Ranger(), 30, null, null),
            new IClassBoost(new Swashbuckler(), -10, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Assassin(), 20, null, null),
            new IClassBoost(new Nightshade(), 10, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new Mage(), -10, null, null),
            new IClassBoost(new Illusionist(), -10, null, null),
            new IClassBoost(new Enchantor(), -10, null, null),
            new IClassBoost(new Mentalist(), -10, null, null),
            new IClassBoost(new Druid(), 20, null, null),
            new IClassBoost(new Shaman(), 15, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Jongleur(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/WildElf.png`
        this.description = `These wild, untamed, elves make their home in the wilderness where they 
choose to survive on their own. They are vicious warriors and thieves and
are a very proud people. Wild elves are well schooled in the art of
natural healing and get fast healing for free. They usually appear with
their bodies covered in war paint and are more muscular than other elves.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): WildElf {
        if (!WildElf.instance) {
            WildElf.instance = new WildElf();
        }
        return WildElf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WildElf.GetInstance() as T;
    }
}

export default WildElf;