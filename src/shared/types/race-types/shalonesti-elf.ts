
import IAbility from "@shared/types/ability-types/ability";
import Hide from "@shared/types/ability-types/skills/hide";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Sneak from "@shared/types/ability-types/skills/sneak";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class ShalonestiElf implements IRace {
    private static instance: ShalonestiElf;
    
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
        this.id = "5";
        this.name = "shalonestielf";
        this.displayName = "Shalonesti Elf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 35
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 82
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 82
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
        this.immunities = [
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Sneak.GetInstance().Get(),
            Hide.GetInstance().Get(),
            Meditation.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
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
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
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
            new Battlemage(),
            new Bladesinger(),
            new Eldritch(),
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), 20, null, null),
            new IClassBoost(new Ranger(), 20, null, null),
            new IClassBoost(new Swashbuckler(), 10, null, null),
            new IClassBoost(new Armsman(), 10, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Assassin(), 10, null, null),
            new IClassBoost(new Bandit(), -10, null, null),
            new IClassBoost(new Nightshade(), 20, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Mage(), 20, null, null),
            new IClassBoost(new Illusionist(), 10, null, null),
            new IClassBoost(new Enchantor(), 10, null, null),
            new IClassBoost(new Mentalist(), 20, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Cleric(), 20, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Priest(), 20, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Bard(), 10, null, null),
            new IClassBoost(new Charlatan(), -10, null, null),
            new IClassBoost(new Invoker(), 20, null, null),
            new IClassBoost(new Transmuter(), 20, null, null),
            new IClassBoost(new Bladesinger(), 30, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/ShalonestiElf.png`
        this.description = `The Shalonesti Elves are followers of the house of Shalonost, the elven
house of royalty.  These elves are well-mannered and educated.  So well
educated, in fact, that they receive meditation and are resistant to mental
attacks.  Shalonesti elves believe themselves to be above all other races,
including other elves.  Other races dub them the "high" elves.  Despite
their high opinion of themselves, they fight for what is good and just as
long as it directly concerns them or the house Shalonost.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): ShalonestiElf {
        if (!ShalonestiElf.instance) {
            ShalonestiElf.instance = new ShalonestiElf();
        }
        return ShalonestiElf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ShalonestiElf.GetInstance() as T;
    }
}

export default ShalonestiElf;