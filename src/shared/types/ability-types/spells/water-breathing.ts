import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WaterBreathing implements IAbility {
  private static instance: WaterBreathing;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help water breath
'WATER BREATHING'
'WATER BREATHING'
Syntax: cast 'water breathing' <character>
This spell allows the character to breath in underwater areas.

'WATER BREATHING'
'WATER BREATHING'

Syntax: cast 'water breathing' <target>

This spell, when cast, gives the target the ability to breath under water
for a specificed period of time.  It tends to be quite useful, as the lack
of available air under water tends to cause great pain to most people.  

See also - ENHANCEMENT`;
    this.manualDescription = "This allows a character to breath underwater, but you can still drown on the surface of the ocean";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (WaterBreathing.instance === undefined) {
      WaterBreathing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WaterBreathing {
    if (!WaterBreathing.instance) {
      WaterBreathing.instance = new WaterBreathing();
    }
    return WaterBreathing.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WaterBreathing.GetInstance() as T;
  }
}

export default WaterBreathing;
