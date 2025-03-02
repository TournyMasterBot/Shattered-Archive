import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Flamestrike implements IAbility {
  private static instance: Flamestrike;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Flamestrike'
FLAMESTRIKE
FLAMESTRIKE

Syntax: cast 'flamestrike' <victim>

With the aid of his deity, the caster calls upon a column of pure fire to
descend upon a foe, causing large amounts of damage. Objects on the person
of the recipient are subject to the effects of the column of flames as well.

See also - ATTACK 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Flamestrike.instance === undefined) {
      Flamestrike.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Flamestrike {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Flamestrike.GetInstance() as T;
  }
}

export default Flamestrike;
