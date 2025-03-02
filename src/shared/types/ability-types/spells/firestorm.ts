import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Firestorm implements IAbility {
  private static instance: Firestorm;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Firestorm'
FIRESTORM
FIRESTORM
Syntax: cast 'firestorm'
A large firestorm is conjured up by the elemental cleric, inflicting damage
on all opposed to him. The conjured storm is so powerful that the fire
continues to afflict the victims for several rounds after the spell has been
cast.
See also: BLIZZARD 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Firestorm.instance === undefined) {
      Firestorm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Firestorm {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Firestorm.GetInstance() as T;
  }
}

export default Firestorm;
