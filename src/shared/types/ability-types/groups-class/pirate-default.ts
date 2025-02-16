import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ConcealedDagger from "@shared/types/ability-types/skills/concealed-dagger";
import Intimidation from "@shared/types/ability-types/skills/intimidation";
import Dropkick from "@shared/types/ability-types/skills/dropkick";
import Disarm from "@shared/types/ability-types/skills/disarm";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import Balance from "@shared/types/ability-types/skills/balance";
import MortalShield from "@shared/types/ability-types/skills/mortal-shield";
import DoubleParry from "@shared/types/ability-types/skills/double-parry";
import Hide from "@shared/types/ability-types/skills/hide";
import GrenadeToss from "@shared/types/ability-types/skills/grenade-toss";
import Pistol from "@shared/types/ability-types/skills/pistol";
import Maingauche from "@shared/types/ability-types/skills/maingauche";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Parry from "@shared/types/ability-types/skills/parry";

export class PirateDefault implements IAbilityGroup {
  static instance: PirateDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.PirateDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ConcealedDagger.GetInstance().Get(),
      Intimidation.GetInstance().Get(),
      Dropkick.GetInstance().Get(),
      Disarm.GetInstance().Get(),
      DualWield.GetInstance().Get(),
      Balance.GetInstance().Get(),
      MortalShield.GetInstance().Get(),
      DoubleParry.GetInstance().Get(),
      Hide.GetInstance().Get(),
      GrenadeToss.GetInstance().Get(),
      Pistol.GetInstance().Get(),
      Maingauche.GetInstance().Get(),
      SecondAttack.GetInstance().Get(),
      Sneak.GetInstance().Get(),
      Parry.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PirateDefault {
    if (!PirateDefault.instance) {
      PirateDefault.instance = new PirateDefault();
    }
    return PirateDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PirateDefault.GetInstance() as T;
  }
}

export default PirateDefault;
