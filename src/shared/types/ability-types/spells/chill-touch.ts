import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ChillTouch implements IAbility {
  private static instance: ChillTouch;

  name: string;
  helpFile: string;
  manualDescription: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Chill Touch'
'CHILL TOUCH'
'CHILL TOUCH'

Syntax: cast 'chill touch' <target>

Those training in combat magics move forward to the casting of the touch of
cold after they have been provided the knowledge of magic missiles.  This
spell offers a slightly more damaging offensive ability.  

An added bonus, at least for the caster, is that the chilling touch may also
adversely affect the target, causing them to shiver enough in combat to
worsen their abilities.  

See also - COMBAT 
`;
    this.manualDescription = `
This spell can cause a minor strength debuff.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ChillTouch.instance === undefined) {
      ChillTouch.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ChillTouch {
    if (!ChillTouch.instance) {
      ChillTouch.instance = new ChillTouch();
    }
    return ChillTouch.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ChillTouch.GetInstance() as T;
  }
}

export default ChillTouch;
