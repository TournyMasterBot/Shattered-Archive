
import IAbility from "@shared/types/ability-types/ability";
import Survive from "@shared/types/ability-types/skills/survive";
import Toughness from "@shared/types/ability-types/skills/toughness";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import MagicDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-magic";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class GullyDwarf implements IRace {
    private static instance: GullyDwarf;
    
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
        this.id = "36";
        this.name = "gullydwarf";
        this.displayName = "Gully Dwarf";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = undefined;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 66
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 30
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 44
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 50
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 90
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
            ...MagicDamageTypes.getAll()
        ];
        this.racialAbilities = [
            Survive.GetInstance().Get(),
            Toughness.GetInstance().Get()
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
            new Nightshade(),
            new Ninja(),
            new Monk(),
            new Dragonslayer(),
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/GullyDwarf.png`
        this.description = `Dwarves are short, stocky demi-humans, known for foul temper and great
stamina.  Dwarves have high strength and constitution, but poor dexterity. 
They are not as smart as humans, but are usually wiser due to their long
lifespans.  Dwarves make excellent fighters and priests, but are very poor
mages or thieves.

Gully Dwarves are short and stout humanoids famous for both their lack of
intelligence and strong stench, second only to goblin.  These creatures live
all over Algoron and serve mostly as servants to the rich and powerful. 
Gully Dwarves are usually easily and very obedient people.  However, when
cornered and forced to defend themselves or a loved one, they become fierce
fighters.  

Gully Dwarves are rumored to be the accidental invention of Dwarves who have
historically tried to generate better Dwarves by the use of forced breeding
with other species.  However, the Dwarf/Gnome offspring backfired creating a
much dumber race.  Dwarves and Gnomes alike refuse to classify Gully Dwarf
as one of their species.  Dwarves detest the very name of the Gully Dwarf
and find no humor in it.  
 
Gully Dwarves cannot be mages, bards or clerics, monks, swashbucklers 
or Nightshades.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): GullyDwarf {
        if (!GullyDwarf.instance) {
            GullyDwarf.instance = new GullyDwarf();
        }
        return GullyDwarf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return GullyDwarf.GetInstance() as T;
    }
}

export default GullyDwarf;