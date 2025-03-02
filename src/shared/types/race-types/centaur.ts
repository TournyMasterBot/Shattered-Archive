
import IAbility from "@shared/types/ability-types/ability";
import Hoof from "@shared/types/ability-types/skills/Hoof";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Centaur implements IRace {
    private static instance: Centaur;
    
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
        this.id = "39";
        this.name = "centaur";
        this.displayName = "Centaur";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = undefined;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 68
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 50
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 54
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 54
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 74
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
            Hoof.GetInstance().Get()
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
            new Bard(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Barbarian(), 20, null, null),
            new IClassBoost(new Ranger(), 20, null, null),
            new IClassBoost(new Samurai(), 10, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Centaur.png`
        this.description = `The Centaur are half human, half horse hooved race.  They have fur only
up to their stomach region and have four legs and two arms.  Centaurs are a
serious and proud race and consider it an absolute insult of all insults to
be ridden as a mount.  Horse jokes are especially offensive to the Centaur. 
The Centaur is raised in the art of warfare and are exceptional fighters,
but tend to distrust magic.  The Centaur's natural enemies have always been
the leonine.  Centuries of war with the Wemic and Felar have made the
Centaur a war hardened race.  

The Centaur is native of Tropica and Southern Althainia and Southern Arkane.
They have recently been driven out of Tropica by the forces of Chaos.  

Centaurs cannot be mages or thieves, swashbucklers or jongleurs.  

Centaurs cannot wear leg armor, but they get a level / 2 ac boost. Twice as hard to hide and sneak,
resistant to being stunned. Cannot RIDE but can charge without a mount.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Centaur {
        if (!Centaur.instance) {
            Centaur.instance = new Centaur();
        }
        return Centaur.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Centaur.GetInstance() as T;
    }
}

export default Centaur;