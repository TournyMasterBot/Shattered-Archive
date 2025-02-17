
import IAbility from "@shared/types/ability-types/ability";
import Hide from "@shared/types/ability-types/skills/hide";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Infravision from "@shared/types/ability-types/spells/infravision";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class DarkElf implements IRace {
    private static instance: DarkElf;
    
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
        this.id = "3";
        this.name = "darkelf";
        this.displayName = "Dark Elf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 9;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 35
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 81
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 81
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 69
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 40
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
        this.immunities = [];
        this.resistances = [];
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
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Thief(), 10, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), 10, null, null),
            new IClassBoost(new Nightshade(), 20, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mage(), 20, null, null),
            new IClassBoost(new Illusionist(), 10, null, null),
            new IClassBoost(new Warlock(), 10, null, null),
            new IClassBoost(new Enchantor(), 10, null, null),
            new IClassBoost(new Mentalist(), 20, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Cleric(), 20, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 20, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/DarkElf.png`
        this.description = `Dark Elves are those elves that have denounced themselves from the good ways
of the elves.  They are outcast from all other races of elves and never
trusted.  Dark elves are very intelligent and resistant to mental attacks as
well.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): DarkElf {
        if (!DarkElf.instance) {
            DarkElf.instance = new DarkElf();
        }
        return DarkElf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkElf.GetInstance() as T;
    }
}

export default DarkElf;