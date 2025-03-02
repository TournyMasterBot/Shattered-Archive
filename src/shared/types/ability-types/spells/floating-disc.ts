import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FloatingDisc implements IAbility {
  private static instance: FloatingDisc;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
'FLOATING DISC'

Syntax: cast 'floating disc'

This useful spell creates a floating field of force which follows the caster
around, allowing him or her to pile treasure high with no fear of weight
penalties.  

It lasts no more than twice the caster's level in hours, and usually less. 
It can hold 10 pounds per level of the caster, with a maximum of five pounds
per item.  

The spell requires an open float location on the character, and the only way
to remove the disc is to die or allow it to run out of energy.  

See also - CREATION 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FloatingDisc.instance === undefined) {
      FloatingDisc.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FloatingDisc {
    if (!FloatingDisc.instance) {
      FloatingDisc.instance = new FloatingDisc();
    }
    return FloatingDisc.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FloatingDisc.GetInstance() as T;
  }
}

export default FloatingDisc;
