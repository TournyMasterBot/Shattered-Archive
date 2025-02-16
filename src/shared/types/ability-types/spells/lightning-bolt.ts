import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LightningBolt implements IAbility {
  private static instance: LightningBolt;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Lightning Bolt";
    this.helpFile = `
help 'Lightning Bolt'
'LIGHTNING BOLT'
'LIGHTNING BOLT'

Syntax: cast 'lightning bolt' <target>
        cast 'lightning bolt' <direction> <target>

As is evidenced by its name, the casting of this spell calls down a massive
lightning bolt from the skies. This bolt of lightning can cause a great
deal of damage, and much like any other lightning, has potential side
effects.

The caster can also direct this spell toward opponents standing in distant
rooms.

See also - WEATHER
        `;
    this.manualDescription =
      "At level 15 you will be able to range this spell.";
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (LightningBolt.instance === undefined) {
      LightningBolt.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): LightningBolt {
    if (!LightningBolt.instance) {
      LightningBolt.instance = new LightningBolt();
    }
    return LightningBolt.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return LightningBolt.GetInstance() as T;
  }
}

export default LightningBolt;
