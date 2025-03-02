import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fireball implements IAbility {
  private static instance: Fireball;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Fireball'
'FIREBALL'
'FIREBALL'

Syntax: cast 'fireball' <direction> <target>
        cast 'fireball' <target>

The first of the truly offensive combat spells, the fireball can deal
massive damage against an opponent, and is particularly effective against
those that are vulnerable to flame.  

Additionally, it is the first of the combat spells that a caster may cast
across a distance, allowing foes at farther ranges to be affected.  

See also - COMBAT
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Fireball.instance === undefined) {
      Fireball.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fireball {
    if (!Fireball.instance) {
      Fireball.instance = new Fireball();
    }
    return Fireball.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fireball.GetInstance() as T;
  }
}

export default Fireball;
