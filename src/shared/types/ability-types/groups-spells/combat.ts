import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import AcidBlast from "@shared/types/ability-types/spells/acid-blast";
import ChillTouch from "@shared/types/ability-types/spells/chill-touch";
import MagicMissile from "@shared/types/ability-types/spells/magic-missile";
import BurningHands from "@shared/types/ability-types/spells/burning-hands";
import ColorSpray from "@shared/types/ability-types/spells/color-spray";
import ShockingGrasp from "@shared/types/ability-types/spells/shocking-grasp";
import ChainLightning from "@shared/types/ability-types/spells/chain-lightning";
import Fireball from "@shared/types/ability-types/spells/fireball";
import Blizzra from "@shared/types/ability-types/spells/blizzra";

export class Combat implements IAbilityGroup {
  static instance: Combat;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Combat;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      AcidBlast.GetInstance().Get(),
      ChillTouch.GetInstance().Get(),
      MagicMissile.GetInstance().Get(),
      BurningHands.GetInstance().Get(),
      ColorSpray.GetInstance().Get(),
      ShockingGrasp.GetInstance().Get(),
      ChainLightning.GetInstance().Get(),
      Fireball.GetInstance().Get(),
      Blizzra.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Combat {
    if (!Combat.instance) {
      Combat.instance = new Combat();
    }
    return Combat.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Combat.GetInstance() as T;
  }
}

export default Combat;
