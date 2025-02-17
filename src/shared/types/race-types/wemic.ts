
import IAbility from "@shared/types/ability-types/ability";
import ForepawSwipe from "@shared/types/ability-types/skills/forepaw-swipe";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Wemic implements IRace {
    private static instance: Wemic;
    
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
        this.id = "31";
        this.name = "wemic";
        this.displayName = "Wemic";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = true;
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
                modifier: 45
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 65
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 70
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
            ForepawSwipe.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Ninja(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Monk(),
            new Dragonslayer()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), 10, null, null),
            new IClassBoost(new Barbarian(), 10, null, null),
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Thief(), -10, null, null),
            new IClassBoost(new Assassin(), -20, null, null),
            new IClassBoost(new Bandit(), -20, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Crusader(), -20, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Priest(), -10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Dragonslayer(), 20, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Wemic.png`
        this.description = `Wemics are part human, part lion, combining the two as centaurs combine
human and horse.  The wemics leonine body has a human torso extending from
what would be a lions neck.  Wemics grow to 10 feet long reaching heights of
six to seven feet when standing erect.  
The leonine body is covered with ducky golden fur, while the underbelly fur
is short and white.  The tip of the tail is a brush of long black hair, and
adults also have a flowing mane of long black hair.  The face is leonine and
the eyes are golden with slit pupils.  The claws of the forepaws are
retractable (and make a dangerous attack), while the hind claws are not.  
Wemics are the male version of the leonine species while their female
counterparts are known as felars.  Wemics blend leonine and aboriginal human
cultures in a primitive society.  They live in nomadic groups called
""prides"", surviving through hunting.  Wemics have human intelligence, and
can learn if exposed to more complex skills, provided they can get past
their superstitious nature.  
Most wemics are warriors, however clerics and especially shaman are very
important to their society as they see everything as supernatural.  Weather
and the changing of the day into the night are functions of the gods.  All
magic is left to be learned by the more understanding (and less stubborn)
felars.

Wemics cannot RIDE but they can charge without a mount.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Wemic {
        if (!Wemic.instance) {
            Wemic.instance = new Wemic();
        }
        return Wemic.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Wemic.GetInstance() as T;
    }
}

export default Wemic;