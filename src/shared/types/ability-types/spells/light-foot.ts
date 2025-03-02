import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LightFoot implements IAbility {
  private static instance: LightFoot;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Light Foot'
light foot

Syntax: cast 'light foot'

Light foot is a spell of enhancement that allows the caster to reduce the
cost it takes to move through a given room. Any creature, friend or foe benefits
from this magic if cast. The spell does not spread to adjacent rooms.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (LightFoot.instance === undefined) {
      LightFoot.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): LightFoot {
    if (!LightFoot.instance) {
      LightFoot.instance = new LightFoot();
    }
    return LightFoot.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return LightFoot.GetInstance() as T;
  }
}

export default LightFoot;
