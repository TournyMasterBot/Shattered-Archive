import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import DarkEssence from "@shared/types/ability-types/spells/dark-essence";
import SummonNightmare from "@shared/types/ability-types/spells/summon-nightmare";
import Intimidate from "@shared/types/ability-types/spells/intimidate";
import SummonDeathknight from "@shared/types/ability-types/spells/summon-deathknight";
import DarkHeal from "@shared/types/ability-types/spells/dark-heal";
import DarkEmpower from "@shared/types/ability-types/spells/dark-empower";
import DarkEnergy from "@shared/types/ability-types/spells/dark-energy";
import SummonFelbeast from "@shared/types/ability-types/spells/summon-felbeast";
import DarkBolt from "@shared/types/ability-types/spells/dark-bolt";
import Fasting from "@shared/types/ability-types/spells/fasting";
import DarkImmunity from "@shared/types/ability-types/spells/dark-immunity";

export class Unholy implements IAbilityGroup {
  static instance: Unholy;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Unholy;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      DarkEssence.GetInstance().Get(),
      SummonNightmare.GetInstance().Get(),
      Intimidate.GetInstance().Get(),
      SummonDeathknight.GetInstance().Get(),
      DarkHeal.GetInstance().Get(),
      DarkEmpower.GetInstance().Get(),
      DarkEnergy.GetInstance().Get(),
      SummonFelbeast.GetInstance().Get(),
      DarkBolt.GetInstance().Get(),
      Fasting.GetInstance().Get(),
      DarkImmunity.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Unholy {
    if (!Unholy.instance) {
      Unholy.instance = new Unholy();
    }
    return Unholy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Unholy.GetInstance() as T;
  }
}

export default Unholy;
