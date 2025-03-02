import IAbility from "@shared/types/ability-types/ability";
import Deeproot from "@shared/types/ability-types/skills/Deeproot";
import Rootvein from "@shared/types/ability-types/skills/rootvein";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BluntDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-blunt";
import ColdDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-cold";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Arboren implements IRace {
    private static instance: Arboren;

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
        this.id = "50";
        this.name = "arboren";
        this.displayName = "Arboren";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 15;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 72
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 50
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 48
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 80
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
        this.resistances = [
            ...BluntDamageTypes.getAll()
        ];
        this.vulnerabilities = [
            ...ColdDamageTypes.getAll()
        ];
        this.racialAbilities = [
            Deeproot.GetInstance().Get(),
            Rootvein.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Armsman(),
            new Samurai(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Monk(),
            new Dragonslayer(),
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = new Map<IDslClass, BoostedClass[]>/* 
        new IClassBoost(new Warrior(), 10, null, null),
        new IClassBoost(new Barbarian(), 10, null, null),
        new IClassBoost(new Ranger(), 30, null, null),
        new IClassBoost(new Cleric(), 20, null, null),
        new IClassBoost(new Priest(), 20, null, null),
        new IClassBoost(new Crusader(), -10, null, null),
        new IClassBoost(new Druid(), 30, null, null),
        new IClassBoost(new Shaman(), 10, null, null),
        new IClassBoost(new Warrior(), 20, null, null),
        new IClassBoost(new Shukenja(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Arboren.png`
        this.description = `The Arboren appear to be made of animated wood.  They are 4 to 5 feet
tall and have the skin of various wood types depending on where they were
born.  The males sprout leaves or various needles and the females sprout
flowers for hair.  Arboren bleed sap instead of blood.  They speak common,
but tend not to speak unless it is important, preferring solitude and
silence.  

The Arboren have populated Algoron since the early days, living in small
communities of forest on every continent.  Only wars, fires and logging have
caused the Arboren to recently venture out into cities.  

Although slightly shorter than most humans, the Arboren are strong, stout
and wise.  Their dense bodies make them slow.  The Arboren are vulnerable to
cold but resistant to bashing.  Every Arboren have two racial skills,
ROOTVEIN which allows them to root into the earth and travel to another
forest on the same continent.  DEEPROOT allows the Arboren to root into the
earth making them almost immune to being stunned.  

While appearing to be made of wood, they DO NOT resemble Treants as they do
wear armor and have humanoid type arms and legs.  Arboren do not use names
in their forest communities, but in the world they prefer to be called names
similar to the wood of which they came from for males and the flowers for
which they sprout for females.  

Arboren are exclusively neutral by nature and make great Druids, Priests and
Rangers.  Arboren can only be Clerics and Warrior classes, excluding
Swashbucklers.  
 
Arboren are known to sprout leaves at people for a variety of reasons.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Arboren {
        if (!Arboren.instance) {
            Arboren.instance = new Arboren();
        }
        return Arboren.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Arboren.GetInstance() as T;
    }
}

export default Arboren;