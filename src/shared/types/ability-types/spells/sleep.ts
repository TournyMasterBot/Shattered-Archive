import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Sleep implements IAbility {
  private static instance: Sleep;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Sleep";
    this.helpFile = `help sleep
REST SLEEP STAND WAKE
REST SLEEP STAND WAKE
Syntax: rest
Syntax: sleep
Syntax: stand
Syntax: wake
These commands change your position. When you REST or SLEEP, you 
regenerate hit points, mana points, and movement points faster.
However, you are more vulnerable to attack, and if you SLEEP,
you won't hear many things happen.
Use STAND or WAKE to come back to a standing position. You can
also WAKE other sleeping characters.

'SLEEP SPELL'
'SLEEP SPELL'

Syntax: cast sleep <victim>

This spell puts its victim to sleep.  

See also - BEGUILING`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Sleep.instance === undefined) {
      Sleep.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sleep {
    if (!Sleep.instance) {
      Sleep.instance = new Sleep();
    }
    return Sleep.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sleep.GetInstance() as T;
  }
}

export default Sleep;
