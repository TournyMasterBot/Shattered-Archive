import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FindFamiliar implements IAbility {
  private static instance: FindFamiliar;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
FIND FAMILIAR
FIND FAMILIAR

Syntax: cast 'find familiar' cat
        cast 'find familiar' raven

A witch or warlock may summon a small pet as a travelling companion and for
aid in magical concentration.  Witches tend to prefer the company of a black
cat, while warlocks are often seen with a raven perched on their shoulder. 

However, either may choose the pet they desire.  

See also - WITCHCRAFT 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FindFamiliar.instance === undefined) {
      FindFamiliar.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FindFamiliar {
    if (!FindFamiliar.instance) {
      FindFamiliar.instance = new FindFamiliar();
    }
    return FindFamiliar.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FindFamiliar.GetInstance() as T;
  }
}

export default FindFamiliar;
